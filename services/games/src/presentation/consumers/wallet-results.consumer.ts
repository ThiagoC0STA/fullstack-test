import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import {
  CRASH_EVENTS_EXCHANGE,
  QUEUES,
  ROUTING_KEYS,
  type WalletDebitSettledMessage,
} from "@crash/contracts";
import { HandleDebitSettledUseCase } from "../../application/use-cases/handle-debit-settled.use-case";

/**
 * Consumes wallet settlement replies. Debit settlements drive the bet
 * saga; credit settlements (payouts/refunds) are terminal and only
 * logged, since the wallet is the system of record for balances.
 */
@Injectable()
export class WalletResultsConsumer {
  private readonly logger = new Logger(WalletResultsConsumer.name);

  constructor(private readonly handleDebitSettled: HandleDebitSettledUseCase) {}

  @RabbitSubscribe({
    exchange: CRASH_EVENTS_EXCHANGE,
    routingKey: [ROUTING_KEYS.WALLET_DEBIT_SETTLED, ROUTING_KEYS.WALLET_CREDIT_SETTLED],
    queue: QUEUES.GAME_WALLET_RESULTS,
    queueOptions: { durable: true },
  })
  async handle(message: unknown): Promise<void> {
    if (isDebitSettledMessage(message)) {
      await this.handleDebitSettled.execute(message);
      return;
    }
    if (isCreditSettled(message)) {
      return;
    }
    this.logger.warn(`Discarding malformed message: ${JSON.stringify(message)}`);
  }
}

function isDebitSettledMessage(value: unknown): value is WalletDebitSettledMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.messageId !== "string" ||
    candidate.type !== ROUTING_KEYS.WALLET_DEBIT_SETTLED
  ) {
    return false;
  }
  const payload = candidate.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const fields = payload as Record<string, unknown>;
  return (
    typeof fields.betId === "string" &&
    typeof fields.roundId === "string" &&
    (fields.status === "succeeded" || fields.status === "failed")
  );
}

function isCreditSettled(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === ROUTING_KEYS.WALLET_CREDIT_SETTLED
  );
}
