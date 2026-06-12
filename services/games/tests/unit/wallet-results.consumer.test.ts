import { describe, expect, test } from "bun:test";
import { Nack } from "@golevelup/nestjs-rabbitmq";
import {
  createMessage,
  ROUTING_KEYS,
  type WalletDebitSettledMessage,
} from "@crash/contracts";
import { WalletResultsConsumer } from "../../src/presentation/consumers/wallet-results.consumer";
import type { HandleDebitSettledUseCase } from "../../src/application/use-cases/handle-debit-settled.use-case";

const NOW = new Date("2026-06-10T12:00:00.000Z");

function buildConsumer() {
  const calls: WalletDebitSettledMessage[] = [];
  const handleDebitSettled = {
    async execute(message: WalletDebitSettledMessage): Promise<void> {
      calls.push(message);
    },
  };
  const consumer = new WalletResultsConsumer(
    handleDebitSettled as unknown as HandleDebitSettledUseCase,
  );
  return { consumer, calls };
}

const debitSettled: WalletDebitSettledMessage = createMessage(
  ROUTING_KEYS.WALLET_DEBIT_SETTLED,
  {
    betId: "bet-1",
    roundId: "round-1",
    playerId: "player-1",
    amountCents: "1000",
    status: "succeeded",
  },
  NOW,
);

describe("WalletResultsConsumer dead-lettering", () => {
  test("drives the saga for a valid debit settlement without nacking", async () => {
    const { consumer, calls } = buildConsumer();

    const result = await consumer.handle(debitSettled);

    expect(result).toBeUndefined();
    expect(calls).toEqual([debitSettled]);
  });

  test("acks a credit settlement (terminal, no saga work)", async () => {
    const { consumer, calls } = buildConsumer();

    const result = await consumer.handle({
      messageId: "msg-2",
      type: ROUTING_KEYS.WALLET_CREDIT_SETTLED,
      payload: { betId: "bet-1", roundId: "round-1" },
    });

    expect(result).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test("dead-letters a malformed message instead of acking it", async () => {
    const { consumer, calls } = buildConsumer();

    const result = await consumer.handle({ nonsense: true });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
