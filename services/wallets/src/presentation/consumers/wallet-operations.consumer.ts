import { Injectable, Logger } from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import {
  CRASH_EVENTS_EXCHANGE,
  QUEUES,
  ROUTING_KEYS,
  type WalletCreditRequestedMessage,
  type WalletDebitRequestedMessage,
} from "@crash/contracts";
import { ProcessCreditUseCase } from "../../application/use-cases/process-credit.use-case";
import { ProcessDebitUseCase } from "../../application/use-cases/process-debit.use-case";

type WalletOperationMessage =
  | WalletDebitRequestedMessage
  | WalletCreditRequestedMessage;

/**
 * Driving adapter for the broker. Both routing keys bind to ONE queue
 * consumed by ONE handler: with separate handlers on a shared queue,
 * RabbitMQ would round-robin messages to the wrong handler.
 */
@Injectable()
export class WalletOperationsConsumer {
  private readonly logger = new Logger(WalletOperationsConsumer.name);

  constructor(
    private readonly processDebit: ProcessDebitUseCase,
    private readonly processCredit: ProcessCreditUseCase,
  ) {}

  @RabbitSubscribe({
    exchange: CRASH_EVENTS_EXCHANGE,
    routingKey: [
      ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
      ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
    ],
    queue: QUEUES.WALLET_OPERATIONS,
    queueOptions: { durable: true },
  })
  async handle(message: unknown): Promise<void> {
    if (!isWalletOperationMessage(message)) {
      this.logger.warn(`Discarding malformed message: ${JSON.stringify(message)}`);
      return;
    }

    if (message.type === ROUTING_KEYS.WALLET_DEBIT_REQUESTED) {
      await this.processDebit.execute(message);
      return;
    }
    await this.processCredit.execute(message);
  }
}

function isWalletOperationMessage(value: unknown): value is WalletOperationMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.messageId !== "string") {
    return false;
  }
  if (
    candidate.type !== ROUTING_KEYS.WALLET_DEBIT_REQUESTED &&
    candidate.type !== ROUTING_KEYS.WALLET_CREDIT_REQUESTED
  ) {
    return false;
  }
  const payload = candidate.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const fields = payload as Record<string, unknown>;
  return (
    typeof fields.playerId === "string" &&
    typeof fields.roundId === "string" &&
    typeof fields.betId === "string" &&
    typeof fields.amountCents === "string" &&
    typeof fields.reason === "string"
  );
}
