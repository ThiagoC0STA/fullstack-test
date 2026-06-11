import { describe, expect, test } from "bun:test";
import { calculatePayoutCents } from "@crash/contracts";
import {
  BettingClosedError,
  CashOutTooLateError,
  DuplicateBetError,
  InvalidBetAmountError,
  InvalidBetTransitionError,
  InvalidRoundTransitionError,
  NoActiveBetError,
  RoundNotRunningError,
} from "../../src/domain/errors";
import { multiplierAtElapsedMs } from "@crash/contracts";
import { sha256Hex } from "../../src/domain/provably-fair/hashing";
import { Round } from "../../src/domain/round";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const BETTING_WINDOW_MS = 10_000;

/** seed-a produces a known crash point of 2.65x (frozen snapshot). */
const SEED = "seed-a";
/** instant-87 produces an instant crash at 1.00x. */
const INSTANT_SEED = "instant-87";

function openRound(seed = SEED): Round {
  return Round.openBetting({
    serverSeed: seed,
    chainIndex: 42,
    bettingWindowMs: BETTING_WINDOW_MS,
    now: NOW,
  });
}

function afterStart(round: Round, elapsedMs: number): Date {
  return new Date((round.startedAt as Date).getTime() + elapsedMs);
}

function placeActiveBet(round: Round, playerId = "player-1", amountCents = "1000") {
  const bet = round.placeBet({ playerId, username: playerId, amountCents, now: NOW });
  bet.confirmDebit();
  return bet;
}

describe("Round.openBetting", () => {
  test("commits to the crash point before any bet exists", () => {
    const round = openRound();
    expect(round.phase).toBe("betting");
    expect(round.seedHash).toBe(sha256Hex(SEED));
    expect(round.crashPointHundredths).toBe(265);
    expect(round.bettingEndsAt.getTime()).toBe(NOW.getTime() + BETTING_WINDOW_MS);
    expect(round.startedAt).toBeNull();
    expect(round.crashedAt).toBeNull();
  });
});

describe("Round.placeBet", () => {
  test("accepts a valid bet during the betting phase", () => {
    const round = openRound();
    const bet = round.placeBet({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
      now: NOW,
    });
    expect(bet.status).toBe("pending_debit");
    expect(round.bets).toHaveLength(1);
  });

  test("enforces the bet limits", () => {
    const round = openRound();
    const base = { playerId: "p", username: "p", now: NOW };
    expect(() => round.placeBet({ ...base, amountCents: "99" })).toThrow(
      InvalidBetAmountError,
    );
    expect(() => round.placeBet({ ...base, amountCents: "100001" })).toThrow(
      InvalidBetAmountError,
    );
    expect(() => round.placeBet({ ...base, amountCents: "10.5" })).toThrow(
      InvalidBetAmountError,
    );
  });

  test("rejects a second bet from the same player", () => {
    const round = openRound();
    placeActiveBet(round, "player-1");
    expect(() =>
      round.placeBet({
        playerId: "player-1",
        username: "player",
        amountCents: "500",
        now: NOW,
      }),
    ).toThrow(DuplicateBetError);
  });

  test("allows betting again after a rejected debit", () => {
    const round = openRound();
    const first = round.placeBet({
      playerId: "player-1",
      username: "player",
      amountCents: "500",
      now: NOW,
    });
    first.reject();
    const second = round.placeBet({
      playerId: "player-1",
      username: "player",
      amountCents: "700",
      now: NOW,
    });
    expect(second.status).toBe("pending_debit");
  });

  test("refuses bets once the round is running", () => {
    const round = openRound();
    round.start(NOW);
    expect(() =>
      round.placeBet({
        playerId: "player-1",
        username: "player",
        amountCents: "1000",
        now: NOW,
      }),
    ).toThrow(BettingClosedError);
  });
});

describe("Round.start", () => {
  test("transitions betting -> running", () => {
    const round = openRound();
    round.start(NOW);
    expect(round.phase).toBe("running");
    expect(round.startedAt).toBe(NOW);
  });

  test("cannot start twice", () => {
    const round = openRound();
    round.start(NOW);
    expect(() => round.start(NOW)).toThrow(InvalidRoundTransitionError);
  });
});

describe("Round.multiplierAt", () => {
  test("is 1.00x at the starting instant and grows with time", () => {
    const round = openRound();
    round.start(NOW);
    expect(round.multiplierAt(afterStart(round, 0))).toBe(100);
    expect(round.multiplierAt(afterStart(round, 5000))).toBe(
      multiplierAtElapsedMs(5000),
    );
  });

  test("is capped at the predetermined crash point", () => {
    const round = openRound();
    round.start(NOW);
    expect(round.multiplierAt(afterStart(round, 600_000))).toBe(265);
  });

  test("throws while not running", () => {
    const round = openRound();
    expect(() => round.multiplierAt(NOW)).toThrow(RoundNotRunningError);
  });
});

describe("Round.cashOut", () => {
  test("pays bet x multiplier at the cashout instant", () => {
    const round = openRound();
    const bet = placeActiveBet(round, "player-1", "1000");
    round.start(NOW);

    const cashoutAt = afterStart(round, 5000);
    round.cashOut("player-1", cashoutAt);

    const expectedMultiplier = multiplierAtElapsedMs(5000);
    expect(bet.status).toBe("cashed_out");
    expect(bet.cashoutMultiplierHundredths).toBe(expectedMultiplier);
    expect(bet.payoutCents).toBe(calculatePayoutCents("1000", expectedMultiplier));
  });

  test("rejects cashout at or after the crash instant", () => {
    const round = openRound();
    placeActiveBet(round, "player-1");
    round.start(NOW);
    expect(() =>
      round.cashOut("player-1", afterStart(round, round.crashElapsedMs)),
    ).toThrow(CashOutTooLateError);
  });

  test("an instant-crash round can never be cashed out", () => {
    const round = openRound(INSTANT_SEED);
    placeActiveBet(round, "player-1");
    round.start(NOW);
    expect(round.crashPointHundredths).toBe(100);
    expect(() => round.cashOut("player-1", afterStart(round, 0))).toThrow(
      CashOutTooLateError,
    );
  });

  test("rejects players without an active bet", () => {
    const round = openRound();
    round.placeBet({
      playerId: "pending-player",
      username: "p",
      amountCents: "1000",
      now: NOW,
    });
    round.start(NOW);
    const at = afterStart(round, 1000);
    // no bet at all
    expect(() => round.cashOut("ghost", at)).toThrow(NoActiveBetError);
    // bet still waiting for the wallet debit
    expect(() => round.cashOut("pending-player", at)).toThrow(NoActiveBetError);
  });

  test("cannot cash out twice", () => {
    const round = openRound();
    placeActiveBet(round, "player-1");
    round.start(NOW);
    round.cashOut("player-1", afterStart(round, 1000));
    expect(() => round.cashOut("player-1", afterStart(round, 2000))).toThrow(
      NoActiveBetError,
    );
  });

  test("rejects cashout while betting", () => {
    const round = openRound();
    placeActiveBet(round, "player-1");
    expect(() => round.cashOut("player-1", NOW)).toThrow(RoundNotRunningError);
  });
});

describe("Round.crash", () => {
  test("marks active bets as lost and preserves cashed out bets", () => {
    const round = openRound();
    const loser = placeActiveBet(round, "loser");
    const winner = placeActiveBet(round, "winner");
    round.start(NOW);
    round.cashOut("winner", afterStart(round, 1000));

    const lost = round.crash(afterStart(round, round.crashElapsedMs));

    expect(round.phase).toBe("crashed");
    expect(lost).toHaveLength(1);
    expect(loser.status).toBe("lost");
    expect(winner.status).toBe("cashed_out");
  });

  test("leaves pending bets untouched for the saga to refund", () => {
    const round = openRound();
    const pending = round.placeBet({
      playerId: "late-player",
      username: "p",
      amountCents: "1000",
      now: NOW,
    });
    round.start(NOW);
    round.crash(afterStart(round, round.crashElapsedMs));
    expect(pending.status).toBe("pending_debit");
  });

  test("cannot crash a round that is not running", () => {
    const round = openRound();
    expect(() => round.crash(NOW)).toThrow(InvalidRoundTransitionError);
  });
});

describe("Bet transitions", () => {
  test("cannot confirm a debit twice", () => {
    const round = openRound();
    const bet = placeActiveBet(round);
    expect(() => bet.confirmDebit()).toThrow(InvalidBetTransitionError);
  });

  test("cannot reject an already active bet", () => {
    const round = openRound();
    const bet = placeActiveBet(round);
    expect(() => bet.reject()).toThrow(InvalidBetTransitionError);
  });
});
