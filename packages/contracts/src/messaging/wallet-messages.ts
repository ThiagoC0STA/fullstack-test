import type { CentsString } from "../money";
import type { MessageEnvelope } from "./envelope";
import type { ROUTING_KEYS } from "./topology";

export type DebitReason = "bet";

export type CreditReason = "cashout_payout" | "bet_refund";

export type DebitFailureReason = "insufficient_funds" | "wallet_not_found";

export interface WalletDebitRequestedPayload {
  playerId: string;
  roundId: string;
  betId: string;
  amountCents: CentsString;
  reason: DebitReason;
}

export interface WalletCreditRequestedPayload {
  playerId: string;
  roundId: string;
  betId: string;
  amountCents: CentsString;
  reason: CreditReason;
}

export interface WalletDebitSettledPayload {
  playerId: string;
  roundId: string;
  betId: string;
  amountCents: CentsString;
  status: "succeeded" | "failed";
  failureReason?: DebitFailureReason;
}

export interface WalletCreditSettledPayload {
  playerId: string;
  roundId: string;
  betId: string;
  amountCents: CentsString;
  reason: CreditReason;
  status: "succeeded";
}

export type WalletDebitRequestedMessage = MessageEnvelope<
  typeof ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
  WalletDebitRequestedPayload
>;

export type WalletCreditRequestedMessage = MessageEnvelope<
  typeof ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
  WalletCreditRequestedPayload
>;

export type WalletDebitSettledMessage = MessageEnvelope<
  typeof ROUTING_KEYS.WALLET_DEBIT_SETTLED,
  WalletDebitSettledPayload
>;

export type WalletCreditSettledMessage = MessageEnvelope<
  typeof ROUTING_KEYS.WALLET_CREDIT_SETTLED,
  WalletCreditSettledPayload
>;

export type WalletMessage =
  | WalletDebitRequestedMessage
  | WalletCreditRequestedMessage
  | WalletDebitSettledMessage
  | WalletCreditSettledMessage;
