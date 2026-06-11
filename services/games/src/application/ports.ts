import type {
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoutingKey,
  WalletCreditRequestedMessage,
  WalletDebitRequestedMessage,
  WsEvent,
} from "@crash/contracts";
import type { Bet } from "../domain/bet";
import type { Round } from "../domain/round";

export interface ClockPort {
  now(): Date;
}

/**
 * Provably fair seed supply. Seeds are pre-generated as a hash chain
 * and consumed from the end toward the start, so every revealed seed
 * pins all previous results.
 */
export interface SeedChainPort {
  /** Generates and stores a fresh chain when no unused seeds remain. */
  ensureAvailable(): Promise<void>;
  /** Returns the next unused seed and marks it consumed. */
  acquireNext(): Promise<{ seed: string; chainIndex: number }>;
}

export interface RoundRepositoryPort {
  /** Inserts or updates the round row (bets are persisted separately). */
  persistRound(round: Round): Promise<void>;
  persistBet(bet: Bet): Promise<void>;
  /** Rounds that never crashed (used for crash recovery on boot). */
  findUnfinished(): Promise<Round[]>;
  findById(roundId: string): Promise<Round | null>;
  findCrashedPage(input: {
    page: number;
    limit: number;
  }): Promise<{ items: RoundHistoryItem[]; total: number }>;
  findPlayerBets(input: {
    playerId: string;
    page: number;
    limit: number;
  }): Promise<{ items: PlayerBetHistoryItem[]; total: number }>;
}

export interface OutboxPort {
  add(
    message: WalletDebitRequestedMessage | WalletCreditRequestedMessage,
    routingKey: RoutingKey,
  ): Promise<void>;
}

export interface InboxPort {
  recordIfNew(messageId: string, type: string, now: Date): Promise<boolean>;
}

export interface TransactionContext {
  rounds: RoundRepositoryPort;
  outbox: OutboxPort;
  inbox: InboxPort;
}

export interface TransactionalRunnerPort {
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/** Server -> client push; the socket.io gateway implements this. */
export interface GameBroadcastPort {
  emit(event: WsEvent, payload: object): void;
}
