import {
  createMessage,
  ROUTING_KEYS,
  type WalletCreditRequestedMessage,
  type WalletCreditSettledPayload,
} from "@crash/contracts";
import { LedgerEntry } from "../../domain/ledger-entry";
import { Wallet } from "../../domain/wallet";
import type { ClockPort, TransactionalRunnerPort } from "../ports";

/**
 * Consumes wallet.credit.requested (cashout payouts and bet refunds).
 * Credits never fail for business reasons; if the wallet is somehow
 * missing it is opened with zero balance first (self-healing, since a
 * credit always follows an earlier successful debit).
 */
export class ProcessCreditUseCase {
  constructor(
    private readonly runner: TransactionalRunnerPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(message: WalletCreditRequestedMessage): Promise<void> {
    await this.runner.run(async (tx) => {
      const now = this.clock.now();
      const isNew = await tx.inbox.recordIfNew(message.messageId, message.type, now);
      if (!isNew) {
        return;
      }

      const { playerId, roundId, betId, amountCents, reason } = message.payload;

      let wallet = await tx.wallets.findByPlayerId(playerId);
      if (!wallet) {
        wallet = Wallet.open(playerId, "0", now);
        await tx.wallets.add(wallet);
      }

      wallet.credit(amountCents, now);

      await tx.ledger.append(
        LedgerEntry.record({
          walletId: wallet.id,
          type: "credit",
          reason,
          amountCents,
          balanceAfterCents: wallet.balanceCents,
          betId,
          roundId,
          messageId: message.messageId,
          now,
        }),
      );

      const payload: WalletCreditSettledPayload = {
        playerId,
        roundId,
        betId,
        amountCents,
        reason,
        status: "succeeded",
      };
      await tx.outbox.add(
        createMessage(ROUTING_KEYS.WALLET_CREDIT_SETTLED, payload, now),
        ROUTING_KEYS.WALLET_CREDIT_SETTLED,
      );
    });
  }
}
