import type { CentsString, MultiplierHundredths } from "../money";

export type RoundPhase = "betting" | "running" | "crashed";

/**
 * Bet lifecycle:
 * pending_debit -> active (wallet debit confirmed)
 * pending_debit -> rejected (insufficient funds / wallet missing)
 * active -> cashed_out (player cashed out before the crash)
 * active -> lost (round crashed while the bet was still open)
 */
export type BetStatus =
  | "pending_debit"
  | "active"
  | "rejected"
  | "cashed_out"
  | "lost";

export interface BetView {
  betId: string;
  playerId: string;
  username: string;
  amountCents: CentsString;
  status: BetStatus;
  cashoutMultiplierHundredths: MultiplierHundredths | null;
  payoutCents: CentsString | null;
  /** Target multiplier (hundredths) the engine auto-cashes at; null = manual. */
  autoCashoutHundredths: MultiplierHundredths | null;
}

export interface RoundSnapshot {
  roundId: string;
  phase: RoundPhase;
  seedHash: string;
  bettingEndsAt: string | null;
  startedAt: string | null;
  multiplierHundredths: MultiplierHundredths | null;
  crashPointHundredths: MultiplierHundredths | null;
  /** Server clock at snapshot time, used by clients to sync the curve. */
  serverTime: string;
  bets: BetView[];
}

export interface RoundHistoryItem {
  roundId: string;
  crashPointHundredths: MultiplierHundredths;
  seedHash: string;
  serverSeed: string;
  crashedAt: string;
}

export interface RoundVerification {
  roundId: string;
  seedHash: string;
  serverSeed: string;
  crashPointHundredths: MultiplierHundredths;
  /** Human-readable description of how to recompute the crash point. */
  algorithm: string;
}

export interface PlayerBetHistoryItem {
  betId: string;
  roundId: string;
  amountCents: CentsString;
  status: BetStatus;
  cashoutMultiplierHundredths: MultiplierHundredths | null;
  payoutCents: CentsString | null;
  crashPointHundredths: MultiplierHundredths | null;
  placedAt: string;
}

export interface WalletView {
  walletId: string;
  playerId: string;
  balanceCents: CentsString;
  updatedAt: string;
}
