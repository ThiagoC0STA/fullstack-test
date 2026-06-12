import { describe, expect, test } from "bun:test";
import { Nack } from "@golevelup/nestjs-rabbitmq";
import {
  createMessage,
  ROUTING_KEYS,
  type WalletCreditRequestedMessage,
  type WalletDebitRequestedMessage,
} from "@crash/contracts";

const NOW = new Date("2026-06-10T12:00:00.000Z");
import { WalletOperationsConsumer } from "../../src/presentation/consumers/wallet-operations.consumer";
import type { ProcessCreditUseCase } from "../../src/application/use-cases/process-credit.use-case";
import type { ProcessDebitUseCase } from "../../src/application/use-cases/process-debit.use-case";

interface SpyUseCase<T> {
  calls: T[];
  execute(message: T): Promise<void>;
}

function spy<T>(): SpyUseCase<T> {
  const calls: T[] = [];
  return {
    calls,
    async execute(message: T): Promise<void> {
      calls.push(message);
    },
  };
}

function buildConsumer() {
  const debit = spy<WalletDebitRequestedMessage>();
  const credit = spy<WalletCreditRequestedMessage>();
  const consumer = new WalletOperationsConsumer(
    debit as unknown as ProcessDebitUseCase,
    credit as unknown as ProcessCreditUseCase,
  );
  return { consumer, debit, credit };
}

const debitMessage: WalletDebitRequestedMessage = createMessage(
  ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
  {
    playerId: "player-1",
    roundId: "round-1",
    betId: "bet-1",
    amountCents: "1000",
    reason: "bet",
  },
  NOW,
);

describe("WalletOperationsConsumer dead-lettering", () => {
  test("routes a valid debit request to the use case without nacking", async () => {
    const { consumer, debit } = buildConsumer();

    const result = await consumer.handle(debitMessage);

    expect(result).toBeUndefined();
    expect(debit.calls).toEqual([debitMessage]);
  });

  test("dead-letters a malformed message instead of acking it", async () => {
    const { consumer, debit, credit } = buildConsumer();

    const result = await consumer.handle({ type: "garbage", payload: 42 });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(debit.calls).toHaveLength(0);
    expect(credit.calls).toHaveLength(0);
  });

  test("dead-letters a message with the right type but an invalid payload", async () => {
    const { consumer } = buildConsumer();

    const result = await consumer.handle({
      messageId: "msg-2",
      type: ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
      payload: { playerId: "player-1" },
    });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
