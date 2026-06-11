import type {
  CentsString,
  MultiplierHundredths,
  PlayerBetHistoryItem,
} from "@crash/contracts";

export type BetResultTone = "win" | "loss" | "pending";

export interface BetResult {
  tone: BetResultTone;
  /** cashout multiplier for a win, crash point for a loss, else null */
  multiplierHundredths: MultiplierHundredths | null;
  amountCents: CentsString;
  payoutCents: CentsString | null;
}

/**
 * Maps a persisted bet to what the player cares about: did it win, at
 * what multiplier, and for how much. Keeps the presentation component
 * free of status branching so the mapping is unit-testable on its own.
 */
export function betResult(item: PlayerBetHistoryItem): BetResult {
  if (item.status === "cashed_out") {
    return {
      tone: "win",
      multiplierHundredths: item.cashoutMultiplierHundredths,
      amountCents: item.amountCents,
      payoutCents: item.payoutCents,
    };
  }
  if (item.status === "lost") {
    return {
      tone: "loss",
      multiplierHundredths: item.crashPointHundredths,
      amountCents: item.amountCents,
      payoutCents: null,
    };
  }
  return {
    tone: "pending",
    multiplierHundredths: null,
    amountCents: item.amountCents,
    payoutCents: null,
  };
}
