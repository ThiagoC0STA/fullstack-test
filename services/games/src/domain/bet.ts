import { randomUUID } from "node:crypto";
import {
  BET_LIMITS,
  calculatePayoutCents,
  compareCents,
  isAutoCashoutTarget,
  isCents,
  type BetStatus,
  type CentsString,
  type MultiplierHundredths,
} from "@crash/contracts";
import {
  InvalidAutoCashoutTargetError,
  InvalidBetAmountError,
  InvalidBetTransitionError,
} from "./errors";

interface BetProps {
  id: string;
  roundId: string;
  playerId: string;
  username: string;
  amountCents: CentsString;
  status: BetStatus;
  cashoutMultiplierHundredths: MultiplierHundredths | null;
  autoCashoutHundredths: MultiplierHundredths | null;
  payoutCents: CentsString | null;
  placedAt: Date;
}

/**
 * Bet lifecycle: pending_debit -> active -> cashed_out | lost,
 * with pending_debit -> rejected when the wallet debit fails.
 * Every transition is guarded; illegal moves throw.
 */
export class Bet {
  id: string;
  roundId: string;
  playerId: string;
  username: string;
  amountCents: CentsString;
  status: BetStatus;
  cashoutMultiplierHundredths: MultiplierHundredths | null;
  autoCashoutHundredths: MultiplierHundredths | null;
  payoutCents: CentsString | null;
  placedAt: Date;

  constructor(props: BetProps) {
    this.id = props.id;
    this.roundId = props.roundId;
    this.playerId = props.playerId;
    this.username = props.username;
    this.amountCents = props.amountCents;
    this.status = props.status;
    this.cashoutMultiplierHundredths = props.cashoutMultiplierHundredths;
    this.autoCashoutHundredths = props.autoCashoutHundredths;
    this.payoutCents = props.payoutCents;
    this.placedAt = props.placedAt;
  }

  static place(input: {
    roundId: string;
    playerId: string;
    username: string;
    amountCents: CentsString;
    autoCashoutHundredths?: MultiplierHundredths | null;
    now: Date;
  }): Bet {
    Bet.assertAmountWithinLimits(input.amountCents);
    const autoCashoutHundredths = input.autoCashoutHundredths ?? null;
    if (autoCashoutHundredths !== null) {
      Bet.assertAutoCashoutTarget(autoCashoutHundredths);
    }
    return new Bet({
      id: randomUUID(),
      roundId: input.roundId,
      playerId: input.playerId,
      username: input.username,
      amountCents: input.amountCents,
      status: "pending_debit",
      cashoutMultiplierHundredths: null,
      autoCashoutHundredths,
      payoutCents: null,
      placedAt: input.now,
    });
  }

  static assertAmountWithinLimits(amountCents: string): void {
    if (!isCents(amountCents)) {
      throw new InvalidBetAmountError(amountCents, "not an integer cents value");
    }
    if (compareCents(amountCents, BET_LIMITS.MIN_CENTS) < 0) {
      throw new InvalidBetAmountError(amountCents, "below the 1.00 minimum");
    }
    if (compareCents(amountCents, BET_LIMITS.MAX_CENTS) > 0) {
      throw new InvalidBetAmountError(amountCents, "above the 1000.00 maximum");
    }
  }

  static assertAutoCashoutTarget(target: number): void {
    if (!isAutoCashoutTarget(target)) {
      throw new InvalidAutoCashoutTargetError(target);
    }
  }

  confirmDebit(): void {
    this.assertTransition("pending_debit", "active");
    this.status = "active";
  }

  reject(): void {
    this.assertTransition("pending_debit", "rejected");
    this.status = "rejected";
  }

  cashOut(multiplier: MultiplierHundredths): void {
    this.assertTransition("active", "cashed_out");
    this.cashoutMultiplierHundredths = multiplier;
    this.payoutCents = calculatePayoutCents(this.amountCents, multiplier);
    this.status = "cashed_out";
  }

  markLost(): void {
    this.assertTransition("active", "lost");
    this.status = "lost";
  }

  /**
   * Compensation for a persistence failure: the cashout was applied in
   * memory but the database rejected the write, so the transition must
   * be undone or the player would silently lose the payout.
   */
  revertCashOut(): void {
    this.assertTransition("cashed_out", "active");
    this.cashoutMultiplierHundredths = null;
    this.payoutCents = null;
    this.status = "active";
  }

  /**
   * Compensation for a persistence failure during debit settlement:
   * back to pending_debit so the redelivered message (the inbox row
   * rolled back with the same transaction) can settle the bet again.
   */
  revertSettlement(): void {
    if (this.status !== "active" && this.status !== "rejected") {
      throw new InvalidBetTransitionError(this.status, "pending_debit");
    }
    this.status = "pending_debit";
  }

  private assertTransition(expectedFrom: BetStatus, to: BetStatus): void {
    if (this.status !== expectedFrom) {
      throw new InvalidBetTransitionError(this.status, to);
    }
  }
}
