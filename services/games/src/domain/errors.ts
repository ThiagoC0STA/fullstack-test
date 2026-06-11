export class GameDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BettingClosedError extends GameDomainError {
  constructor() {
    super("Bets are only accepted during the betting phase");
  }
}

export class DuplicateBetError extends GameDomainError {
  constructor(readonly playerId: string) {
    super("Player already has a bet in this round");
  }
}

export class InvalidBetAmountError extends GameDomainError {
  constructor(readonly amountCents: string, reason: string) {
    super(`Invalid bet amount "${amountCents}": ${reason}`);
  }
}

export class InvalidRoundTransitionError extends GameDomainError {
  constructor(from: string, to: string) {
    super(`Invalid round transition: ${from} -> ${to}`);
  }
}

export class InvalidBetTransitionError extends GameDomainError {
  constructor(from: string, to: string) {
    super(`Invalid bet transition: ${from} -> ${to}`);
  }
}

export class NoActiveBetError extends GameDomainError {
  constructor(readonly playerId: string) {
    super("Player has no active bet to cash out");
  }
}

export class RoundNotRunningError extends GameDomainError {
  constructor() {
    super("Cash out is only possible while the round is running");
  }
}

export class CashOutTooLateError extends GameDomainError {
  constructor() {
    super("The round already crashed");
  }
}
