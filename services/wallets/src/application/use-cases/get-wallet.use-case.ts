import type { Wallet } from "../../domain/wallet";
import { WalletDomainError } from "../../domain/errors";
import type { TransactionalRunnerPort } from "../ports";

export class WalletNotFoundError extends WalletDomainError {
  constructor(readonly playerId: string) {
    super(`No wallet found for player ${playerId}`);
  }
}

export class GetWalletUseCase {
  constructor(private readonly runner: TransactionalRunnerPort) {}

  async execute(playerId: string): Promise<Wallet> {
    return this.runner.run(async (tx) => {
      const wallet = await tx.wallets.findByPlayerId(playerId);
      if (!wallet) {
        throw new WalletNotFoundError(playerId);
      }
      return wallet;
    });
  }
}
