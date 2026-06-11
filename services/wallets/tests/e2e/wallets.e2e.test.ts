import { beforeAll, describe, expect, test } from "bun:test";
import { isCents } from "@crash/contracts";

const KONG_URL = "http://localhost:8000";
const KEYCLOAK_URL = "http://localhost:8080";

let token: string;

beforeAll(async () => {
  try {
    const health = await fetch(`${KONG_URL}/wallets/health`);
    if (!health.ok) {
      throw new Error("unhealthy");
    }
  } catch {
    throw new Error(
      "E2E requires the full stack: run `bun run docker:up` first (Kong on :8000)",
    );
  }
  const response = await fetch(
    `${KEYCLOAK_URL}/realms/crash-game/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "crash-game-client",
        username: "player",
        password: "player123",
      }),
    },
  );
  token = ((await response.json()) as { access_token: string }).access_token;
});

describe("wallets E2E", () => {
  test("rejects unauthenticated access", async () => {
    const me = await fetch(`${KONG_URL}/wallets/me`);
    expect(me.status).toBe(401);
    const open = await fetch(`${KONG_URL}/wallets`, { method: "POST" });
    expect(open.status).toBe(401);
  });

  test("opens the wallet idempotently and returns integer-cents balance", async () => {
    const first = await fetch(`${KONG_URL}/wallets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(first.status).toBe(201);
    const a = (await first.json()) as {
      success: boolean;
      data: { walletId: string; balanceCents: string };
    };
    expect(a.success).toBe(true);
    expect(isCents(a.data.balanceCents)).toBe(true);

    const second = await fetch(`${KONG_URL}/wallets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const b = (await second.json()) as { data: { walletId: string } };
    expect(b.data.walletId).toBe(a.data.walletId);
  });

  test("GET /wallets/me returns the same wallet", async () => {
    const me = await fetch(`${KONG_URL}/wallets/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      success: boolean;
      data: { playerId: string; balanceCents: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.playerId).toBe("11111111-1111-1111-1111-111111111111");
    expect(isCents(body.data.balanceCents)).toBe(true);
  });
});
