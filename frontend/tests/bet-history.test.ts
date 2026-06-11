import { describe, expect, test } from "bun:test";
import type { PlayerBetHistoryItem } from "@crash/contracts";
import { betResult } from "../src/lib/bet-history";

function item(overrides: Partial<PlayerBetHistoryItem>): PlayerBetHistoryItem {
  return {
    betId: "bet-1",
    roundId: "round-1",
    amountCents: "1000",
    status: "active",
    cashoutMultiplierHundredths: null,
    payoutCents: null,
    crashPointHundredths: null,
    placedAt: "2026-06-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("betResult", () => {
  test("a cashed-out bet is a win at its cashout multiplier", () => {
    const result = betResult(
      item({
        status: "cashed_out",
        cashoutMultiplierHundredths: 254,
        payoutCents: "2540",
      }),
    );
    expect(result.tone).toBe("win");
    expect(result.multiplierHundredths).toBe(254);
    expect(result.payoutCents).toBe("2540");
  });

  test("a lost bet is a loss at the round crash point", () => {
    const result = betResult(item({ status: "lost", crashPointHundredths: 123 }));
    expect(result.tone).toBe("loss");
    expect(result.multiplierHundredths).toBe(123);
    expect(result.payoutCents).toBeNull();
  });

  test("an open bet is pending with no multiplier", () => {
    expect(betResult(item({ status: "active" })).tone).toBe("pending");
    expect(betResult(item({ status: "pending_debit" })).tone).toBe("pending");
    expect(betResult(item({ status: "active" })).multiplierHundredths).toBeNull();
  });

  test("carries the stake through every outcome", () => {
    expect(betResult(item({ status: "lost", amountCents: "750" })).amountCents).toBe(
      "750",
    );
  });
});
