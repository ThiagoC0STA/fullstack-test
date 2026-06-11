import { describe, expect, test } from "bun:test";
import {
  addCents,
  compareCents,
  ROUTING_KEYS,
  subtractCents,
  type BetView,
} from "@crash/contracts";
import {
  call,
  ensureStackIsUp,
  getAccessToken,
  myBets,
  myWallet,
  publishWalletOperation,
  waitFor,
  waitForBalance,
  waitForBetStatus,
  waitForFreshBettingRound,
  waitForRunningRound,
} from "./helpers";

/**
 * Full-stack gameplay flows through Kong, Keycloak and RabbitMQ.
 * Requires `bun run docker:up`.
 */
let token: string;
let setupPromise: Promise<void> | null = null;

/** Lazy setup: bun's default hook timeout is too tight right after boot. */
function ready(): Promise<void> {
  setupPromise ??= (async () => {
    await ensureStackIsUp();
    token = await getAccessToken();
    // open the wallet (idempotent) so a wiped database still works
    await call("/wallets", { method: "POST", token });
  })();
  return setupPromise;
}

describe("crash game E2E", () => {
  test(
    "bet -> multiplier runs -> cashout -> balance updated exactly",
    async () => {
      await ready();
      await waitForFreshBettingRound();
      const before = (await myWallet(token)).balanceCents;

      const placed = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "1000" },
      });
      expect(placed.status).toBe(201);
      expect(placed.data?.status).toBe("pending_debit");
      const betId = placed.data?.betId as string;

      await waitForBetStatus(token, betId, ["active"]);
      await waitForRunningRound();

      const cashedOut = await waitFor(
        async () => {
          const result = await call<BetView>("/games/bet/cashout", {
            method: "POST",
            token,
          });
          return result.status === 201 && result.data ? result.data : null;
        },
        "cashout to be accepted",
        10_000,
        150,
      );

      expect(cashedOut.status).toBe("cashed_out");
      const payout = cashedOut.payoutCents as string;
      expect(compareCents(payout, "1000")).toBeGreaterThanOrEqual(0);

      const expected = addCents(subtractCents(before, "1000"), payout);
      const wallet = await waitForBalance(token, expected);
      expect(wallet.balanceCents).toBe(expected);
    },
    { timeout: 300_000 },
  );

  test(
    "bet -> crash -> bet lost and balance only debited",
    async () => {
      await ready();
      await waitForFreshBettingRound();
      const before = (await myWallet(token)).balanceCents;

      const placed = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "500" },
      });
      expect(placed.status).toBe(201);
      const betId = placed.data?.betId as string;
      await waitForBetStatus(token, betId, ["active"]);

      // never cash out; the predetermined crash settles the bet as lost
      const lost = await waitForBetStatus(token, betId, ["lost"], 240_000);
      expect(lost.status).toBe("lost");
      expect(lost.crashPointHundredths).not.toBeNull();

      const wallet = await waitForBalance(token, subtractCents(before, "500"));
      expect(wallet.balanceCents).toBe(subtractCents(before, "500"));
    },
    { timeout: 600_000 },
  );

  test(
    "rejects a second bet in the same round",
    async () => {
      await ready();
      await waitForFreshBettingRound();
      const first = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "200" },
      });
      expect(first.status).toBe(201);

      const second = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "200" },
      });
      expect(second.status).toBe(409);
      expect(second.error).toContain("already");
    },
    { timeout: 300_000 },
  );

  test(
    "two simultaneous bets settle to exactly one accepted, one rejected",
    async () => {
      await ready();
      await waitForFreshBettingRound();

      // fire both at once: the in-memory aggregate guard and the partial
      // unique index (round_id, player_id) WHERE status <> 'rejected'
      // must let exactly one through under a real race
      const [a, b] = await Promise.all([
        call<BetView>("/games/bet", { method: "POST", token, body: { amountCents: "300" } }),
        call<BetView>("/games/bet", { method: "POST", token, body: { amountCents: "300" } }),
      ]);

      const statuses = [a.status, b.status].sort((x, y) => x - y);
      expect(statuses).toEqual([201, 409]);

      const bets = await myBets(token);
      const inThisRound = bets.filter(
        (placed) => placed.amountCents === "300" && placed.status !== "rejected",
      );
      // never two live bets for the same player in one round
      const roundIds = new Set(inThisRound.map((placed) => placed.roundId));
      expect(roundIds.size).toBe(inThisRound.length);
    },
    { timeout: 300_000 },
  );

  test(
    "rejects bets while the round is running",
    async () => {
      await ready();
      await waitForRunningRound(60_000);
      const result = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "200" },
      });
      expect(result.status).toBe(409);
    },
    { timeout: 120_000 },
  );

  test(
    "rejects malformed amounts outright",
    async () => {
      await ready();
      // amount validation only runs once the round accepts bets, so a
      // betting phase is required to observe the 400 (otherwise 409)
      await waitForFreshBettingRound();
      const result = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "10.50" },
      });
      expect(result.status).toBe(400);
    },
    { timeout: 300_000 },
  );

  test(
    "insufficient funds rejects the bet through the saga",
    async () => {
      // drain the wallet down to 50.00 through the real broker path,
      // then try to bet 100.00: the wallet replies debit failed and the
      // bet must end up rejected
      await ready();
      const balance = (await myWallet(token)).balanceCents;
      if (compareCents(balance, "5000") > 0) {
        await publishWalletOperation(
          ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
          subtractCents(balance, "5000"),
          "bet",
        );
        await waitForBalance(token, "5000", 20_000);
      }

      await waitForFreshBettingRound();
      const placed = await call<BetView>("/games/bet", {
        method: "POST",
        token,
        body: { amountCents: "10000" },
      });
      expect(placed.status).toBe(201);
      const betId = placed.data?.betId as string;

      const rejected = await waitForBetStatus(token, betId, ["rejected"], 20_000);
      expect(rejected.status).toBe("rejected");

      // top the wallet back up so repeated runs keep working; the
      // credit is computed from the live balance, never assumed
      const drained = (await myWallet(token)).balanceCents;
      if (compareCents(drained, "100000") < 0) {
        await publishWalletOperation(
          ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
          subtractCents("100000", drained),
          "bet_refund",
        );
        await waitForBalance(token, "100000", 20_000);
      }
    },
    { timeout: 420_000 },
  );

  test(
    "unauthenticated requests are rejected",
    async () => {
      await ready();
      const bet = await call("/games/bet", {
        method: "POST",
        body: { amountCents: "1000" },
      });
      expect(bet.status).toBe(401);
      const wallet = await call("/wallets/me");
      expect(wallet.status).toBe(401);
    },
    { timeout: 15_000 },
  );

  test(
    "crashed rounds are independently verifiable",
    async () => {
      await ready();
      const history = await call<Array<{ roundId: string }>>(
        "/games/rounds/history?page=1&limit=1",
      );
      const roundId = history.data?.[0]?.roundId;
      expect(roundId).toBeDefined();

      const verification = await call<{
        seedHash: string;
        serverSeed: string;
        crashPointHundredths: number;
      }>(`/games/rounds/${roundId}/verify`);
      expect(verification.status).toBe(200);
      expect(verification.data?.serverSeed).toBeDefined();

      const hash = new Bun.CryptoHasher("sha256")
        .update(verification.data?.serverSeed as string)
        .digest("hex");
      expect(hash).toBe(verification.data?.seedHash as string);
    },
    { timeout: 15_000 },
  );
});
