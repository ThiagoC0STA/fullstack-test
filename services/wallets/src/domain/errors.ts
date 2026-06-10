export class WalletDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientFundsError extends WalletDomainError {
  constructor(
    readonly balanceCents: string,
    readonly requestedCents: string,
  ) {
    super(
      `Insufficient funds: balance ${balanceCents} cents, requested ${requestedCents} cents`,
    );
  }
}

export class InvalidOperationAmountError extends WalletDomainError {
  constructor(readonly amountCents: string) {
    super(`Wallet operations require a positive amount, got "${amountCents}"`);
  }
}
