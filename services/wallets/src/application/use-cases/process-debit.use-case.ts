import {
  createMessage,
  ROUTING_KEYS,
  type WalletDebitRequestedMessage,
  type WalletDebitSettledPayload,
} from "@crash/contracts";
import { InsufficientFundsError } from "../../domain/errors";
import { LedgerEntry } from "../../domain/ledger-entry";
import type { ClockPort, TransactionalRunnerPort, TransactionContext } from "../ports";

/**
 * Consumes wallet.debit.requested. In ONE transaction: inbox dedup,
 * balance change, ledger entry and the outbox reply. The game service
 * decides what to do with failures (reject the bet).
 */
export class ProcessDebitUseCase {
  constructor(
    private readonly runner: TransactionalRunnerPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(message: WalletDebitRequestedMessage): Promise<void> {
    await this.runner.run(async (tx) => {
      const now = this.clock.now();
      const isNew = await tx.inbox.recordIfNew(message.messageId, message.type, now);
      if (!isNew) {
        return;
      }

      const { playerId, roundId, betId, amountCents } = message.payload;
      const wallet = await tx.wallets.findByPlayerId(playerId);

      if (!wallet) {
        await this.reply(tx, message, "failed", "wallet_not_found", now);
        return;
      }

      try {
        wallet.debit(amountCents, now);
      } catch (error: unknown) {
        if (error instanceof InsufficientFundsError) {
          await this.reply(tx, message, "failed", "insufficient_funds", now);
          return;
        }
        throw error;
      }

      await tx.ledger.append(
        LedgerEntry.record({
          walletId: wallet.id,
          type: "debit",
          reason: message.payload.reason,
          amountCents,
          balanceAfterCents: wallet.balanceCents,
          betId,
          roundId,
          messageId: message.messageId,
          now,
        }),
      );
      await this.reply(tx, message, "succeeded", undefined, now);
    });
  }

  private async reply(
    tx: TransactionContext,
    message: WalletDebitRequestedMessage,
    status: WalletDebitSettledPayload["status"],
    failureReason: WalletDebitSettledPayload["failureReason"],
    now: Date,
  ): Promise<void> {
    const payload: WalletDebitSettledPayload = {
      playerId: message.payload.playerId,
      roundId: message.payload.roundId,
      betId: message.payload.betId,
      amountCents: message.payload.amountCents,
      status,
      ...(failureReason ? { failureReason } : {}),
    };
    await tx.outbox.add(
      createMessage(ROUTING_KEYS.WALLET_DEBIT_SETTLED, payload, now),
      ROUTING_KEYS.WALLET_DEBIT_SETTLED,
    );
  }
}
