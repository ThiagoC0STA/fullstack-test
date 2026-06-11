import { beforeEach, describe, expect, test } from "bun:test";
import {
  createMessage,
  ROUTING_KEYS,
  WS_EVENTS,
  type WalletDebitSettledMessage,
  type WalletDebitSettledPayload,
} from "@crash/contracts";
import { CurrentRoundStore } from "../../src/application/current-round.store";
import { CashOutUseCase } from "../../src/application/use-cases/cash-out.use-case";
import { HandleDebitSettledUseCase } from "../../src/application/use-cases/handle-debit-settled.use-case";
import { PlaceBetUseCase } from "../../src/application/use-cases/place-bet.use-case";
import {
  BettingClosedError,
  DuplicateBetError,
  NoActiveBetError,
} from "../../src/domain/errors";
import { Round } from "../../src/domain/round";
import {
  FakeBroadcast,
  FakeContext,
  FakeInbox,
  FakeOutbox,
  FakeRoundRepository,
  FakeRunner,
  MutableClock,
} from "./helpers/fakes";

const NOW = new Date("2026-06-10T12:00:00.000Z");

interface SagaHarness {
  store: CurrentRoundStore;
  clock: MutableClock;
  broadcast: FakeBroadcast;
  repository: FakeRoundRepository;
  outbox: FakeOutbox;
  inbox: FakeInbox;
  failNext: { value: boolean };
  placeBet: PlaceBetUseCase;
  cashOut: CashOutUseCase;
  handleSettled: HandleDebitSettledUseCase;
}

function buildHarness(): SagaHarness {
  const store = new CurrentRoundStore();
  const clock = new MutableClock(NOW);
  const broadcast = new FakeBroadcast();
  const repository = new FakeRoundRepository();
  const outbox = new FakeOutbox();
  const inbox = new FakeInbox();
  const failNext = { value: false };
  const runner = new FakeRunner(new FakeContext(repository, outbox, inbox), failNext);
  return {
    store,
    clock,
    broadcast,
    repository,
    outbox,
    inbox,
    failNext,
    placeBet: new PlaceBetUseCase(store, runner, broadcast, clock),
    cashOut: new CashOutUseCase(store, runner, broadcast, clock),
    handleSettled: new HandleDebitSettledUseCase(store, runner, broadcast, clock),
  };
}

function openBettingRound(harness: SagaHarness): Round {
  const round = Round.openBetting({
    serverSeed: "seed-a",
    chainIndex: 7,
    bettingWindowMs: 10_000,
    now: NOW,
  });
  harness.store.set(round);
  return round;
}

function settledMessage(
  overrides: Partial<WalletDebitSettledPayload>,
): WalletDebitSettledMessage {
  return createMessage(
    ROUTING_KEYS.WALLET_DEBIT_SETTLED,
    {
      playerId: "player-1",
      roundId: "round-1",
      betId: "bet-1",
      amountCents: "1000",
      status: "succeeded",
      ...overrides,
    },
    NOW,
  );
}

let harness: SagaHarness;

beforeEach(() => {
  harness = buildHarness();
});

describe("PlaceBetUseCase", () => {
  test("stores the pending bet and stages the debit request atomically", async () => {
    const round = openBettingRound(harness);

    const view = await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });

    expect(view.status).toBe("pending_debit");
    expect(harness.repository.persistedBets).toHaveLength(1);
    expect(harness.outbox.messages).toHaveLength(1);
    expect(harness.outbox.messages[0]?.routingKey).toBe(
      ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
    );
    expect(harness.broadcast.names()).toContain(WS_EVENTS.BET_PLACED);
    expect(round.bets).toHaveLength(1);
  });

  test("throws when there is no round at all", async () => {
    expect(
      harness.placeBet.execute({
        playerId: "player-1",
        username: "player",
        amountCents: "1000",
      }),
    ).rejects.toThrow(BettingClosedError);
  });

  test("propagates duplicate bet violations", async () => {
    openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    expect(
      harness.placeBet.execute({
        playerId: "player-1",
        username: "player",
        amountCents: "500",
      }),
    ).rejects.toThrow(DuplicateBetError);
  });

  test("rolls the bet out of memory when the transaction fails", async () => {
    const round = openBettingRound(harness);
    harness.failNext.value = true;

    expect(
      harness.placeBet.execute({
        playerId: "player-1",
        username: "player",
        amountCents: "1000",
      }),
    ).rejects.toThrow("simulated transaction failure");

    expect(round.bets).toHaveLength(0);
  });
});

describe("CashOutUseCase", () => {
  test("computes the payout server-side and stages the credit", async () => {
    const round = openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    round.bets[0]?.confirmDebit();
    round.start(NOW);
    harness.clock.advance(5000);

    const view = await harness.cashOut.execute({ playerId: "player-1" });

    expect(view.status).toBe("cashed_out");
    expect(view.payoutCents).not.toBeNull();
    const credit = harness.outbox.messages.find(
      (entry) => entry.routingKey === ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
    );
    expect((credit?.message.payload as { reason: string }).reason).toBe(
      "cashout_payout",
    );
    expect(harness.broadcast.names()).toContain(WS_EVENTS.BET_CASHED_OUT);
  });

  test("rejects players without an active bet", async () => {
    const round = openBettingRound(harness);
    round.start(NOW);
    harness.clock.advance(1000);
    expect(harness.cashOut.execute({ playerId: "ghost" })).rejects.toThrow(
      NoActiveBetError,
    );
  });
});

describe("HandleDebitSettledUseCase", () => {
  test("activates the bet when the debit succeeded and the round is open", async () => {
    const round = openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    const bet = round.bets[0];

    await harness.handleSettled.execute(
      settledMessage({ betId: bet?.id as string, roundId: round.id }),
    );

    expect(bet?.status).toBe("active");
    expect(harness.broadcast.names()).toContain(WS_EVENTS.BET_SETTLED);
  });

  test("rejects the bet when the wallet reports insufficient funds", async () => {
    const round = openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    const bet = round.bets[0];

    await harness.handleSettled.execute(
      settledMessage({
        betId: bet?.id as string,
        roundId: round.id,
        status: "failed",
        failureReason: "insufficient_funds",
      }),
    );

    expect(bet?.status).toBe("rejected");
  });

  test("COMPENSATES with a refund when the debit lands after the crash", async () => {
    const round = openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    const bet = round.bets[0];
    round.start(NOW);
    round.crash(new Date(NOW.getTime() + round.crashElapsedMs));

    await harness.handleSettled.execute(
      settledMessage({ betId: bet?.id as string, roundId: round.id }),
    );

    expect(bet?.status).toBe("rejected");
    const refund = harness.outbox.messages.find(
      (entry) =>
        entry.routingKey === ROUTING_KEYS.WALLET_CREDIT_REQUESTED &&
        (entry.message.payload as { reason: string }).reason === "bet_refund",
    );
    expect(refund).toBeDefined();
    expect((refund?.message.payload as { amountCents: string }).amountCents).toBe(
      "1000",
    );
  });

  test("ignores redelivered settlements (inbox dedup)", async () => {
    const round = openBettingRound(harness);
    await harness.placeBet.execute({
      playerId: "player-1",
      username: "player",
      amountCents: "1000",
    });
    const bet = round.bets[0];
    const message = settledMessage({ betId: bet?.id as string, roundId: round.id });

    await harness.handleSettled.execute(message);
    await harness.handleSettled.execute(message);

    expect(bet?.status).toBe("active");
    const settledBroadcasts = harness.broadcast
      .names()
      .filter((name) => name === WS_EVENTS.BET_SETTLED);
    expect(settledBroadcasts).toHaveLength(1);
  });

  test("ignores settlements for unknown bets", async () => {
    openBettingRound(harness);
    await harness.handleSettled.execute(
      settledMessage({ betId: "ghost-bet", roundId: "ghost-round" }),
    );
    expect(harness.broadcast.names()).not.toContain(WS_EVENTS.BET_SETTLED);
  });
});
