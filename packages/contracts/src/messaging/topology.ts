/**
 * RabbitMQ topology shared by both services.
 *
 * Game and Wallet communicate through a single topic exchange.
 * Each service owns the queue it consumes from:
 * - Wallet consumes debit/credit requests published by Game.
 * - Game consumes settlement results published by Wallet.
 */
export const CRASH_EVENTS_EXCHANGE = "crash.events";

export const QUEUES = {
  WALLET_OPERATIONS: "wallets.operations",
  GAME_WALLET_RESULTS: "games.wallet-results",
} as const;

export const ROUTING_KEYS = {
  WALLET_DEBIT_REQUESTED: "wallet.debit.requested",
  WALLET_CREDIT_REQUESTED: "wallet.credit.requested",
  WALLET_DEBIT_SETTLED: "wallet.debit.settled",
  WALLET_CREDIT_SETTLED: "wallet.credit.settled",
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
