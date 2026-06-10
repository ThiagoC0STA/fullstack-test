import type { MultiplierHundredths } from "../money";
import type { BetView, RoundSnapshot } from "../api/views";

/**
 * Server -> client events. Player actions (bet, cashout) always go
 * through REST; the socket only pushes state so every connected client
 * stays in sync.
 */
export const WS_EVENTS = {
  /** Full state snapshot, sent right after a client connects. */
  ROUND_SNAPSHOT: "round.snapshot",
  ROUND_BETTING_STARTED: "round.betting_started",
  ROUND_STARTED: "round.started",
  MULTIPLIER_TICK: "multiplier.tick",
  ROUND_CRASHED: "round.crashed",
  BET_PLACED: "bet.placed",
  BET_SETTLED: "bet.settled",
  BET_CASHED_OUT: "bet.cashed_out",
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export type RoundSnapshotEvent = RoundSnapshot;

export interface RoundBettingStartedEvent {
  roundId: string;
  seedHash: string;
  bettingEndsAt: string;
  serverTime: string;
}

export interface RoundStartedEvent {
  roundId: string;
  startedAt: string;
  serverTime: string;
}

export interface MultiplierTickEvent {
  roundId: string;
  multiplierHundredths: MultiplierHundredths;
  elapsedMs: number;
}

export interface RoundCrashedEvent {
  roundId: string;
  crashPointHundredths: MultiplierHundredths;
  /** Revealed seed so players can verify the crash point. */
  serverSeed: string;
  seedHash: string;
}

export interface BetPlacedEvent {
  roundId: string;
  bet: BetView;
}

export interface BetSettledEvent {
  roundId: string;
  bet: BetView;
}

export interface BetCashedOutEvent {
  roundId: string;
  bet: BetView;
}
