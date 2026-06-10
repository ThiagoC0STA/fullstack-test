import type { CentsString } from "@crash/contracts";
import { LedgerEntry } from "../../domain/ledger-entry";
import { Wallet } from "../../domain/wallet";
import type { ClockPort, TransactionalRunnerPort } from "../ports";

/**
 * Opens the player's wallet, granting the configured starting balance.
 * Idempotent: calling it again returns the existing wallet untouched,
 * so the frontend can call it on every login.
 */
export class OpenWalletUseCase {
  constructor(
    private readonly runner: TransactionalRunnerPort,
    private readonly clock: ClockPort,
    private readonly initialBalanceCents: CentsString,
  ) {}

  async execute(playerId: string): Promise<Wallet> {
    return this.runner.run(async (tx) => {
      const existing = await tx.wallets.findByPlayerId(playerId);
      if (existing) {
        return existing;
      }

      const now = this.clock.now();
      const wallet = Wallet.open(playerId, this.initialBalanceCents, now);
      await tx.wallets.add(wallet);

      if (wallet.balanceCents !== "0") {
        await tx.ledger.append(
          LedgerEntry.record({
            walletId: wallet.id,
            type: "credit",
            reason: "initial_grant",
            amountCents: wallet.balanceCents,
            balanceAfterCents: wallet.balanceCents,
            betId: null,
            roundId: null,
            messageId: `initial-grant:${wallet.id}`,
            now,
          }),
        );
      }

      return wallet;
    });
  }
}
