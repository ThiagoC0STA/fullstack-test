import { describe, expect, test } from "bun:test";
import {
  createMessage,
  ROUTING_KEYS,
  type RoutingKey,
  type WalletCreditRequestedMessage,
  type WalletDebitRequestedMessage,
  type WalletDebitSettledPayload,
  type WalletMessage,
} from "@crash/contracts";
import type { LedgerEntry } from "../../src/domain/ledger-entry";
import { Wallet } from "../../src/domain/wallet";
import type {
  ClockPort,
  TransactionContext,
  TransactionalRunnerPort,
} from "../../src/application/ports";
import {
  GetWalletUseCase,
  WalletNotFoundError,
} from "../../src/application/use-cases/get-wallet.use-case";
import { OpenWalletUseCase } from "../../src/application/use-cases/open-wallet.use-case";
import { ProcessCreditUseCase } from "../../src/application/use-cases/process-credit.use-case";
import { ProcessDebitUseCase } from "../../src/application/use-cases/process-debit.use-case";

const NOW = new Date("2026-06-10T12:00:00.000Z");

class FixedClock implements ClockPort {
  now(): Date {
    return NOW;
  }
}

class FakeContext implements TransactionContext {
  walletsByPlayer = new Map<string, Wallet>();
  ledgerEntries: LedgerEntry[] = [];
  inboxIds = new Set<string>();
  outboxMessages: Array<{ message: WalletMessage; routingKey: RoutingKey }> = [];

  wallets = {
    findByPlayerId: (playerId: string): Promise<Wallet | null> =>
      Promise.resolve(this.walletsByPlayer.get(playerId) ?? null),
    add: (wallet: Wallet): Promise<void> => {
      this.walletsByPlayer.set(wallet.playerId, wallet);
      return Promise.resolve();
    },
  };

  ledger = {
    append: (entry: LedgerEntry): Promise<void> => {
      this.ledgerEntries.push(entry);
      return Promise.resolve();
    },
  };

  inbox = {
    recordIfNew: (messageId: string): Promise<boolean> => {
      if (this.inboxIds.has(messageId)) {
        return Promise.resolve(false);
      }
      this.inboxIds.add(messageId);
      return Promise.resolve(true);
    },
  };

  outbox = {
    add: (message: WalletMessage, routingKey: RoutingKey): Promise<void> => {
      this.outboxMessages.push({ message, routingKey });
      return Promise.resolve();
    },
  };
}

class FakeRunner implements TransactionalRunnerPort {
  constructor(private readonly context: FakeContext) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return work(this.context);
  }
}

function setup() {
  const context = new FakeContext();
  const runner = new FakeRunner(context);
  const clock = new FixedClock();
  return { context, runner, clock };
}

function debitMessage(
  overrides: Partial<WalletDebitRequestedMessage["payload"]> = {},
): WalletDebitRequestedMessage {
  return createMessage(
    ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
    {
      playerId: "player-1",
      roundId: "round-1",
      betId: "bet-1",
      amountCents: "500",
      reason: "bet" as const,
      ...overrides,
    },
    NOW,
  );
}

function creditMessage(
  overrides: Partial<WalletCreditRequestedMessage["payload"]> = {},
): WalletCreditRequestedMessage {
  return createMessage(
    ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
    {
      playerId: "player-1",
      roundId: "round-1",
      betId: "bet-1",
      amountCents: "2540",
      reason: "cashout_payout" as const,
      ...overrides,
    },
    NOW,
  );
}

describe("OpenWalletUseCase", () => {
  test("opens a wallet with the initial grant and records it in the ledger", async () => {
    const { context, runner, clock } = setup();
    const useCase = new OpenWalletUseCase(runner, clock, "100000");

    const wallet = await useCase.execute("player-1");

    expect(wallet.balanceCents).toBe("100000");
    expect(context.ledgerEntries).toHaveLength(1);
    expect(context.ledgerEntries[0]?.reason).toBe("initial_grant");
  });

  test("is idempotent: a second call returns the existing wallet untouched", async () => {
    const { context, runner, clock } = setup();
    const useCase = new OpenWalletUseCase(runner, clock, "100000");

    const first = await useCase.execute("player-1");
    first.debit("400", NOW);
    const second = await useCase.execute("player-1");

    expect(second.id).toBe(first.id);
    expect(second.balanceCents).toBe("99600");
    expect(context.ledgerEntries).toHaveLength(1);
  });

  test("skips the grant ledger entry when the initial balance is zero", async () => {
    const { context, runner, clock } = setup();
    const useCase = new OpenWalletUseCase(runner, clock, "0");

    await useCase.execute("player-1");

    expect(context.ledgerEntries).toHaveLength(0);
  });
});

describe("GetWalletUseCase", () => {
  test("returns the player's wallet", async () => {
    const { context, runner } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "5000", NOW));

    const wallet = await new GetWalletUseCase(runner).execute("player-1");

    expect(wallet.balanceCents).toBe("5000");
  });

  test("throws WalletNotFoundError for unknown players", async () => {
    const { runner } = setup();

    expect(new GetWalletUseCase(runner).execute("ghost")).rejects.toThrow(
      WalletNotFoundError,
    );
  });
});

describe("ProcessDebitUseCase", () => {
  test("debits, appends to the ledger and replies settled:succeeded", async () => {
    const { context, runner, clock } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "10000", NOW));
    const useCase = new ProcessDebitUseCase(runner, clock);

    await useCase.execute(debitMessage());

    expect(context.walletsByPlayer.get("player-1")?.balanceCents).toBe("9500");
    expect(context.ledgerEntries).toHaveLength(1);
    expect(context.ledgerEntries[0]?.balanceAfterCents).toBe("9500");
    expect(context.outboxMessages).toHaveLength(1);
    const reply = context.outboxMessages[0]?.message.payload as WalletDebitSettledPayload;
    expect(reply.status).toBe("succeeded");
    expect(reply.betId).toBe("bet-1");
  });

  test("replies settled:failed insufficient_funds without touching the balance", async () => {
    const { context, runner, clock } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "100", NOW));
    const useCase = new ProcessDebitUseCase(runner, clock);

    await useCase.execute(debitMessage({ amountCents: "500" }));

    expect(context.walletsByPlayer.get("player-1")?.balanceCents).toBe("100");
    expect(context.ledgerEntries).toHaveLength(0);
    const reply = context.outboxMessages[0]?.message.payload as WalletDebitSettledPayload;
    expect(reply.status).toBe("failed");
    expect(reply.failureReason).toBe("insufficient_funds");
  });

  test("replies settled:failed wallet_not_found for unknown players", async () => {
    const { context, runner, clock } = setup();
    const useCase = new ProcessDebitUseCase(runner, clock);

    await useCase.execute(debitMessage({ playerId: "ghost" }));

    const reply = context.outboxMessages[0]?.message.payload as WalletDebitSettledPayload;
    expect(reply.status).toBe("failed");
    expect(reply.failureReason).toBe("wallet_not_found");
  });

  test("processes a redelivered message exactly once", async () => {
    const { context, runner, clock } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "10000", NOW));
    const useCase = new ProcessDebitUseCase(runner, clock);
    const message = debitMessage();

    await useCase.execute(message);
    await useCase.execute(message);

    expect(context.walletsByPlayer.get("player-1")?.balanceCents).toBe("9500");
    expect(context.ledgerEntries).toHaveLength(1);
    expect(context.outboxMessages).toHaveLength(1);
  });
});

describe("ProcessCreditUseCase", () => {
  test("credits the wallet and replies settled:succeeded", async () => {
    const { context, runner, clock } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "9500", NOW));
    const useCase = new ProcessCreditUseCase(runner, clock);

    await useCase.execute(creditMessage());

    expect(context.walletsByPlayer.get("player-1")?.balanceCents).toBe("12040");
    expect(context.ledgerEntries[0]?.reason).toBe("cashout_payout");
    expect(context.outboxMessages[0]?.routingKey).toBe(
      ROUTING_KEYS.WALLET_CREDIT_SETTLED,
    );
  });

  test("self-heals by opening a missing wallet before crediting", async () => {
    const { context, runner, clock } = setup();
    const useCase = new ProcessCreditUseCase(runner, clock);

    await useCase.execute(creditMessage({ playerId: "ghost", amountCents: "300" }));

    expect(context.walletsByPlayer.get("ghost")?.balanceCents).toBe("300");
  });

  test("processes a redelivered credit exactly once", async () => {
    const { context, runner, clock } = setup();
    context.walletsByPlayer.set("player-1", Wallet.open("player-1", "0", NOW));
    const useCase = new ProcessCreditUseCase(runner, clock);
    const message = creditMessage({ amountCents: "1000" });

    await useCase.execute(message);
    await useCase.execute(message);

    expect(context.walletsByPlayer.get("player-1")?.balanceCents).toBe("1000");
    expect(context.outboxMessages).toHaveLength(1);
  });
});
