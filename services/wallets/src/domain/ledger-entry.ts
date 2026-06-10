import { randomUUID } from "node:crypto";
import type { CentsString, CreditReason, DebitReason } from "@crash/contracts";

export type LedgerEntryType = "credit" | "debit";

/** Ledger reasons include wallet-internal events the broker never sees. */
export type LedgerReason = DebitReason | CreditReason | "initial_grant";

interface LedgerEntryProps {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  reason: LedgerReason;
  amountCents: CentsString;
  balanceAfterCents: CentsString;
  betId: string | null;
  roundId: string | null;
  /** Broker message that caused this entry; ties the ledger to the inbox. */
  messageId: string;
  createdAt: Date;
}

/**
 * Append-only audit record. Every balance change writes exactly one
 * ledger entry in the same transaction, so the ledger always replays to
 * the current balance.
 */
export class LedgerEntry {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  reason: LedgerReason;
  amountCents: CentsString;
  balanceAfterCents: CentsString;
  betId: string | null;
  roundId: string | null;
  messageId: string;
  createdAt: Date;

  constructor(props: LedgerEntryProps) {
    this.id = props.id;
    this.walletId = props.walletId;
    this.type = props.type;
    this.reason = props.reason;
    this.amountCents = props.amountCents;
    this.balanceAfterCents = props.balanceAfterCents;
    this.betId = props.betId;
    this.roundId = props.roundId;
    this.messageId = props.messageId;
    this.createdAt = props.createdAt;
  }

  static record(input: Omit<LedgerEntryProps, "id" | "createdAt"> & { now: Date }): LedgerEntry {
    const { now, ...props } = input;
    return new LedgerEntry({ ...props, id: randomUUID(), createdAt: now });
  }
}
