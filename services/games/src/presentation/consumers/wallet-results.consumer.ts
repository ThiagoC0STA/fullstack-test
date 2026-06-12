import { Injectable, Logger } from "@nestjs/common";
import {
  Nack,
  RabbitSubscribe,
  forceDeleteAssertQueueErrorHandler,
} from "@golevelup/nestjs-rabbitmq";
import {
  CRASH_DEAD_LETTER_EXCHANGE,
  CRASH_EVENTS_EXCHANGE,
  DEAD_LETTER_QUEUES,
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
    queueOptions: {
      durable: true,
      deadLetterExchange: CRASH_DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: DEAD_LETTER_QUEUES.GAME_WALLET_RESULTS,
    },
    // Recreate the queue if it predates the dead-letter arguments, so adding
    // the DLQ doesn't crash boot with PRECONDITION_FAILED on existing stacks.
    assertQueueErrorHandler: forceDeleteAssertQueueErrorHandler,
  })
  async handle(message: unknown): Promise<Nack | void> {
    if (isDebitSettledMessage(message)) {
      await this.handleDebitSettled.execute(message);
      return;
    }
    if (isCreditSettled(message)) {
      return;
    }
    // Poison message: requeue would loop forever, so reject without requeue
    // and let the broker dead-letter it for inspection/replay.
    this.logger.error(
      `Dead-lettering malformed message: ${JSON.stringify(message)}`,
    );
    return new Nack(false);
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
