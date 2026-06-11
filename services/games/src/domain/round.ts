import { randomUUID } from "node:crypto";
import type {
  CentsString,
  MultiplierHundredths,
  RoundPhase,
} from "@crash/contracts";
import { Bet } from "./bet";
import {
  BettingClosedError,
  CashOutTooLateError,
  DuplicateBetError,
  InvalidRoundTransitionError,
  NoActiveBetError,
  RoundNotRunningError,
} from "./errors";
import { calculateCrashPointHundredths } from "./provably-fair/crash-point";
import { sha256Hex } from "./provably-fair/hashing";
import {
  elapsedMsToReachMultiplier,
  multiplierAtElapsedMs,
} from "./multiplier-curve";

interface RoundProps {
  id: string;
  chainIndex: number;
  serverSeed: string;
  seedHash: string;
  crashPointHundredths: MultiplierHundredths;
  phase: RoundPhase;
  bettingEndsAt: Date;
  startedAt: Date | null;
  crashedAt: Date | null;
  createdAt: Date;
}

/**
 * Round aggregate: owns the phase machine (betting -> running ->
 * crashed) and every bet invariant. The crash point is derived from the
 * seed at creation time, BEFORE any bet exists; only the seed hash is
 * published until the crash reveals the seed.
 *
 * Bets are part of the aggregate; the repository loads them alongside
 * the round. The DB also enforces one bet per player per round with a
 * unique (round_id, player_id) constraint.
 */
export class Round {
  id: string;
  chainIndex: number;
  serverSeed: string;
  seedHash: string;
  crashPointHundredths: MultiplierHundredths;
  phase: RoundPhase;
  bettingEndsAt: Date;
  startedAt: Date | null;
  crashedAt: Date | null;
  createdAt: Date;
  bets: Bet[] = [];

  constructor(props: RoundProps) {
    this.id = props.id;
    this.chainIndex = props.chainIndex;
    this.serverSeed = props.serverSeed;
    this.seedHash = props.seedHash;
    this.crashPointHundredths = props.crashPointHundredths;
    this.phase = props.phase;
    this.bettingEndsAt = props.bettingEndsAt;
    this.startedAt = props.startedAt;
    this.crashedAt = props.crashedAt;
    this.createdAt = props.createdAt;
  }

  static openBetting(input: {
    serverSeed: string;
    chainIndex: number;
    bettingWindowMs: number;
    now: Date;
  }): Round {
    return new Round({
      id: randomUUID(),
      chainIndex: input.chainIndex,
      serverSeed: input.serverSeed,
      seedHash: sha256Hex(input.serverSeed),
      crashPointHundredths: calculateCrashPointHundredths(input.serverSeed),
      phase: "betting",
      bettingEndsAt: new Date(input.now.getTime() + input.bettingWindowMs),
      startedAt: null,
      crashedAt: null,
      createdAt: input.now,
    });
  }

  placeBet(input: {
    playerId: string;
    username: string;
    amountCents: CentsString;
    now: Date;
  }): Bet {
    if (this.phase !== "betting") {
      throw new BettingClosedError();
    }
    const existing = this.bets.find(
      (bet) => bet.playerId === input.playerId && bet.status !== "rejected",
    );
    if (existing) {
      throw new DuplicateBetError(input.playerId);
    }
    const bet = Bet.place({
      roundId: this.id,
      playerId: input.playerId,
      username: input.username,
      amountCents: input.amountCents,
      now: input.now,
    });
    this.bets.push(bet);
    return bet;
  }

  start(now: Date): void {
    if (this.phase !== "betting") {
      throw new InvalidRoundTransitionError(this.phase, "running");
    }
    this.phase = "running";
    this.startedAt = now;
  }

  /** Milliseconds after start at which the predetermined crash happens. */
  get crashElapsedMs(): number {
    return elapsedMsToReachMultiplier(this.crashPointHundredths);
  }

  /**
   * Multiplier shown/paid at `now`, capped at the crash point. Only
   * meaningful while running.
   */
  multiplierAt(now: Date): MultiplierHundredths {
    if (this.phase !== "running" || !this.startedAt) {
      throw new RoundNotRunningError();
    }
    const elapsed = Math.max(0, now.getTime() - this.startedAt.getTime());
    const multiplier = multiplierAtElapsedMs(elapsed);
    return Math.min(multiplier, this.crashPointHundredths);
  }

  hasReachedCrashPoint(now: Date): boolean {
    if (this.phase !== "running" || !this.startedAt) {
      return false;
    }
    return now.getTime() - this.startedAt.getTime() >= this.crashElapsedMs;
  }

  cashOut(playerId: string, now: Date): Bet {
    if (this.phase !== "running" || !this.startedAt) {
      throw new RoundNotRunningError();
    }
    if (this.hasReachedCrashPoint(now)) {
      throw new CashOutTooLateError();
    }
    const bet = this.bets.find(
      (candidate) => candidate.playerId === playerId && candidate.status === "active",
    );
    if (!bet) {
      throw new NoActiveBetError(playerId);
    }
    bet.cashOut(this.multiplierAt(now));
    return bet;
  }

  /** Crashes the round and returns the bets that lost. */
  crash(now: Date): Bet[] {
    if (this.phase !== "running") {
      throw new InvalidRoundTransitionError(this.phase, "crashed");
    }
    this.phase = "crashed";
    this.crashedAt = now;
    const losers = this.bets.filter((bet) => bet.status === "active");
    for (const bet of losers) {
      bet.markLost();
    }
    return losers;
  }
}
