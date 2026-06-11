import { randomUUID } from "node:crypto";
import {
  BET_LIMITS,
  calculatePayoutCents,
  compareCents,
  isCents,
  type BetStatus,
  type CentsString,
  type MultiplierHundredths,
} from "@crash/contracts";
import { InvalidBetAmountError, InvalidBetTransitionError } from "./errors";

interface BetProps {
  id: string;
  roundId: string;
  playerId: string;
  username: string;
  amountCents: CentsString;
  status: BetStatus;
  cashoutMultiplierHundredths: MultiplierHundredths | null;
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
    this.payoutCents = props.payoutCents;
    this.placedAt = props.placedAt;
  }

  static place(input: {
    roundId: string;
    playerId: string;
    username: string;
    amountCents: CentsString;
    now: Date;
  }): Bet {
    Bet.assertAmountWithinLimits(input.amountCents);
    return new Bet({
      id: randomUUID(),
      roundId: input.roundId,
      playerId: input.playerId,
      username: input.username,
      amountCents: input.amountCents,
      status: "pending_debit",
      cashoutMultiplierHundredths: null,
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

  private assertTransition(expectedFrom: BetStatus, to: BetStatus): void {
    if (this.status !== expectedFrom) {
      throw new InvalidBetTransitionError(this.status, to);
    }
  }
}
