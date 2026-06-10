import { randomUUID } from "node:crypto";
import {
  addCents,
  compareCents,
  isCents,
  subtractCents,
  type CentsString,
} from "@crash/contracts";
import { InsufficientFundsError, InvalidOperationAmountError } from "./errors";

interface WalletProps {
  id: string;
  playerId: string;
  balanceCents: CentsString;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Wallet aggregate. One per player.
 *
 * Invariants enforced here, not in callers:
 * - balance is always a non-negative integer amount of cents
 * - every operation moves a strictly positive amount
 *
 * The clock is always injected (`now`) so behavior stays deterministic
 * under test. Persistence mapping lives in infrastructure (EntitySchema);
 * this class has no ORM coupling.
 */
export class Wallet {
  id: string;
  playerId: string;
  balanceCents: CentsString;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: WalletProps) {
    this.id = props.id;
    this.playerId = props.playerId;
    this.balanceCents = props.balanceCents;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static open(playerId: string, initialBalanceCents: CentsString, now: Date): Wallet {
    if (!isCents(initialBalanceCents)) {
      throw new InvalidOperationAmountError(initialBalanceCents);
    }
    return new Wallet({
      id: randomUUID(),
      playerId,
      balanceCents: initialBalanceCents,
      createdAt: now,
      updatedAt: now,
    });
  }

  credit(amountCents: CentsString, now: Date): void {
    Wallet.assertOperationAmount(amountCents);
    this.balanceCents = addCents(this.balanceCents, amountCents);
    this.updatedAt = now;
  }

  debit(amountCents: CentsString, now: Date): void {
    Wallet.assertOperationAmount(amountCents);
    if (compareCents(this.balanceCents, amountCents) < 0) {
      throw new InsufficientFundsError(this.balanceCents, amountCents);
    }
    this.balanceCents = subtractCents(this.balanceCents, amountCents);
    this.updatedAt = now;
  }

  private static assertOperationAmount(amountCents: string): void {
    if (!isCents(amountCents) || amountCents === "0") {
      throw new InvalidOperationAmountError(amountCents);
    }
  }
}
