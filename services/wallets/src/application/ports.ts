import type { RoutingKey, WalletMessage } from "@crash/contracts";
import type { LedgerEntry } from "../domain/ledger-entry";
import type { Wallet } from "../domain/wallet";

/**
 * Hexagonal ports. Use cases depend only on these interfaces;
 * MikroORM / RabbitMQ adapters live in infrastructure.
 */

export interface ClockPort {
  now(): Date;
}

export interface WalletRepositoryPort {
  findByPlayerId(playerId: string): Promise<Wallet | null>;
  add(wallet: Wallet): Promise<void>;
}

export interface LedgerRepositoryPort {
  append(entry: LedgerEntry): Promise<void>;
}

export interface InboxPort {
  /**
   * Records the messageId if it was never seen before.
   * Returns false for duplicates, which the caller must skip
   * (at-least-once delivery, exactly-once processing).
   */
  recordIfNew(messageId: string, type: string, now: Date): Promise<boolean>;
}

export interface OutboxPort {
  /** Stages a message in the same transaction as the domain change. */
  add(message: WalletMessage, routingKey: RoutingKey): Promise<void>;
}

/**
 * All repositories handed to `work` share one database transaction:
 * wallet change, ledger entry, inbox record and outbox message commit
 * or roll back together.
 */
export interface TransactionContext {
  wallets: WalletRepositoryPort;
  ledger: LedgerRepositoryPort;
  inbox: InboxPort;
  outbox: OutboxPort;
}

export interface TransactionalRunnerPort {
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
