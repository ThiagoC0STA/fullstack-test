/**
 * RabbitMQ topology shared by both services.
 *
 * Game and Wallet communicate through a single topic exchange.
 * Each service owns the queue it consumes from:
 * - Wallet consumes debit/credit requests published by Game.
 * - Game consumes settlement results published by Wallet.
 */
export const CRASH_EVENTS_EXCHANGE = "crash.events";

/**
 * Dead-letter exchange. Messages a consumer rejects without requeue
 * (unparseable / schema-invalid) are routed here instead of being
 * silently dropped, so they can be inspected and replayed.
 */
export const CRASH_DEAD_LETTER_EXCHANGE = "crash.events.dlx";

export const QUEUES = {
  WALLET_OPERATIONS: "wallets.operations",
  GAME_WALLET_RESULTS: "games.wallet-results",
} as const;

/**
 * Parking queues for poison messages. Each work queue dead-letters to its
 * own DLQ using the DLQ name as the routing key on the dead-letter exchange.
 */
export const DEAD_LETTER_QUEUES = {
  WALLET_OPERATIONS: "wallets.operations.dlq",
  GAME_WALLET_RESULTS: "games.wallet-results.dlq",
} as const;

export type DeadLetterQueue =
  (typeof DEAD_LETTER_QUEUES)[keyof typeof DEAD_LETTER_QUEUES];

export const ROUTING_KEYS = {
  WALLET_DEBIT_REQUESTED: "wallet.debit.requested",
  WALLET_CREDIT_REQUESTED: "wallet.credit.requested",
  WALLET_DEBIT_SETTLED: "wallet.debit.settled",
  WALLET_CREDIT_SETTLED: "wallet.credit.settled",
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
