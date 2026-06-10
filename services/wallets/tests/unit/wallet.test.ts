import { describe, expect, test } from "bun:test";
import {
  InsufficientFundsError,
  InvalidOperationAmountError,
} from "../../src/domain/errors";
import { LedgerEntry } from "../../src/domain/ledger-entry";
import { Wallet } from "../../src/domain/wallet";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const LATER = new Date("2026-06-10T12:00:01.000Z");

function openWallet(initialBalanceCents = "10000"): Wallet {
  return Wallet.open("player-1", initialBalanceCents, NOW);
}

describe("Wallet.open", () => {
  test("opens with the given initial balance", () => {
    const wallet = openWallet("5000");
    expect(wallet.playerId).toBe("player-1");
    expect(wallet.balanceCents).toBe("5000");
    expect(wallet.createdAt).toBe(NOW);
    expect(wallet.updatedAt).toBe(NOW);
    expect(wallet.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("allows opening with zero balance", () => {
    expect(openWallet("0").balanceCents).toBe("0");
  });

  test("rejects non-integer initial balances", () => {
    expect(() => Wallet.open("p", "10.50", NOW)).toThrow(InvalidOperationAmountError);
    expect(() => Wallet.open("p", "-1", NOW)).toThrow(InvalidOperationAmountError);
  });
});

describe("Wallet.credit", () => {
  test("adds to the balance and touches updatedAt", () => {
    const wallet = openWallet("1000");
    wallet.credit("250", LATER);
    expect(wallet.balanceCents).toBe("1250");
    expect(wallet.updatedAt).toBe(LATER);
  });

  test("keeps exact precision on large balances", () => {
    const wallet = openWallet("9007199254740991");
    wallet.credit("9007199254740991", LATER);
    expect(wallet.balanceCents).toBe("18014398509481982");
  });

  test("rejects zero and malformed amounts", () => {
    const wallet = openWallet();
    expect(() => wallet.credit("0", LATER)).toThrow(InvalidOperationAmountError);
    expect(() => wallet.credit("1.5", LATER)).toThrow(InvalidOperationAmountError);
    expect(() => wallet.credit("-100", LATER)).toThrow(InvalidOperationAmountError);
    expect(wallet.balanceCents).toBe("10000");
  });
});

describe("Wallet.debit", () => {
  test("subtracts from the balance", () => {
    const wallet = openWallet("1000");
    wallet.debit("999", LATER);
    expect(wallet.balanceCents).toBe("1");
  });

  test("allows debiting the exact balance down to zero", () => {
    const wallet = openWallet("1000");
    wallet.debit("1000", LATER);
    expect(wallet.balanceCents).toBe("0");
  });

  test("throws InsufficientFundsError instead of going negative", () => {
    const wallet = openWallet("1000");
    expect(() => wallet.debit("1001", LATER)).toThrow(InsufficientFundsError);
    expect(wallet.balanceCents).toBe("1000");
  });

  test("reports balance and requested amount in the error", () => {
    const wallet = openWallet("100");
    try {
      wallet.debit("500", LATER);
      throw new Error("expected debit to throw");
    } catch (error: unknown) {
      if (!(error instanceof InsufficientFundsError)) throw error;
      expect(error.balanceCents).toBe("100");
      expect(error.requestedCents).toBe("500");
    }
  });

  test("rejects zero and malformed amounts", () => {
    const wallet = openWallet();
    expect(() => wallet.debit("0", LATER)).toThrow(InvalidOperationAmountError);
    expect(() => wallet.debit("abc", LATER)).toThrow(InvalidOperationAmountError);
  });
});

describe("LedgerEntry.record", () => {
  test("captures the full audit trail of an operation", () => {
    const entry = LedgerEntry.record({
      walletId: "wallet-1",
      type: "debit",
      reason: "bet",
      amountCents: "500",
      balanceAfterCents: "9500",
      betId: "bet-1",
      roundId: "round-1",
      messageId: "msg-1",
      now: NOW,
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.type).toBe("debit");
    expect(entry.reason).toBe("bet");
    expect(entry.amountCents).toBe("500");
    expect(entry.balanceAfterCents).toBe("9500");
    expect(entry.messageId).toBe("msg-1");
    expect(entry.createdAt).toBe(NOW);
  });

  test("supports entries without bet or round context", () => {
    const entry = LedgerEntry.record({
      walletId: "wallet-1",
      type: "credit",
      reason: "cashout_payout",
      amountCents: "2540",
      balanceAfterCents: "12040",
      betId: null,
      roundId: null,
      messageId: "msg-2",
      now: NOW,
    });
    expect(entry.betId).toBeNull();
    expect(entry.roundId).toBeNull();
  });
});
