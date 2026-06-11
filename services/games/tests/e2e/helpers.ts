import {
  createMessage,
  ROUTING_KEYS,
  type ApiResponse,
  type BetView,
  type PlayerBetHistoryItem,
  type RoundSnapshot,
  type WalletView,
} from "@crash/contracts";

/**
 * E2E harness for the full docker:up stack. Everything goes through the
 * public surfaces: Kong for REST, Keycloak for tokens and the RabbitMQ
 * management API to stage wallet operations exactly like the game
 * service would (same contracts, same queues).
 */
export const KONG_URL = "http://localhost:8000";
export const KEYCLOAK_URL = "http://localhost:8080";
export const RABBITMQ_API = "http://localhost:15672/api";
export const TEST_PLAYER_ID = "11111111-1111-1111-1111-111111111111";

export async function ensureStackIsUp(): Promise<void> {
  try {
    const games = await fetch(`${KONG_URL}/games/health`);
    const wallets = await fetch(`${KONG_URL}/wallets/health`);
    if (!games.ok || !wallets.ok) {
      throw new Error("unhealthy");
    }
  } catch {
    throw new Error(
      "E2E requires the full stack: run `bun run docker:up` first (Kong on :8000)",
    );
  }
}

export async function getAccessToken(): Promise<string> {
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
  if (!response.ok) {
    throw new Error(`Keycloak token request failed: ${response.status}`);
  }
  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}

interface RequestOptions {
  method?: "GET" | "POST";
  token?: string;
  body?: object;
}

export async function call<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; data: T | null; error: string | null }> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${KONG_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  return {
    status: response.status,
    data: json?.data ?? null,
    error: json?.error ?? null,
  };
}

export async function currentRound(): Promise<RoundSnapshot | null> {
  const result = await call<RoundSnapshot | null>("/games/rounds/current");
  return result.data;
}

export async function myWallet(token: string): Promise<WalletView> {
  const result = await call<WalletView>("/wallets/me", { token });
  if (!result.data) {
    throw new Error(`wallet fetch failed: ${result.error ?? result.status}`);
  }
  return result.data;
}

export async function myBets(token: string): Promise<PlayerBetHistoryItem[]> {
  const result = await call<PlayerBetHistoryItem[]>("/games/bets/me?limit=10", {
    token,
  });
  return result.data ?? [];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  probe: () => Promise<T | null>,
  description: string,
  timeoutMs: number,
  intervalMs = 300,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
}

/**
 * Betting round with enough window left to place a bet reliably.
 * The default timeout covers a worst-case long round: the multiplier
 * cap (10000x) takes ~154s to reach, plus cooldown and betting window.
 *
 * Rounds where the test player already holds a live bet are skipped:
 * consecutive tests can otherwise land in the SAME betting window the
 * previous test bet in, and every place-bet would 409 as a duplicate.
 */
export function waitForFreshBettingRound(timeoutMs = 240_000): Promise<RoundSnapshot> {
  return waitFor(
    async () => {
      const round = await currentRound();
      if (
        round?.phase === "betting" &&
        round.bettingEndsAt &&
        Date.parse(round.bettingEndsAt) - Date.parse(round.serverTime) > 3_000 &&
        !round.bets.some(
          (bet) => bet.playerId === TEST_PLAYER_ID && bet.status !== "rejected",
        )
      ) {
        return round;
      }
      return null;
    },
    "a fresh betting round",
    timeoutMs,
  );
}

export function waitForRunningRound(timeoutMs = 60_000): Promise<RoundSnapshot> {
  return waitFor(
    async () => {
      const round = await currentRound();
      return round?.phase === "running" ? round : null;
    },
    "a running round",
    timeoutMs,
  );
}

export function waitForBetStatus(
  token: string,
  betId: string,
  statuses: ReadonlyArray<BetView["status"]>,
  timeoutMs = 15_000,
): Promise<PlayerBetHistoryItem> {
  return waitFor(
    async () => {
      const bets = await myBets(token);
      const bet = bets.find((candidate) => candidate.betId === betId);
      return bet && statuses.includes(bet.status) ? bet : null;
    },
    `bet ${betId} to reach ${statuses.join("|")}`,
    timeoutMs,
  );
}

export function waitForBalance(
  token: string,
  expectedCents: string,
  timeoutMs = 15_000,
): Promise<WalletView> {
  return waitFor(
    async () => {
      const wallet = await myWallet(token);
      return wallet.balanceCents === expectedCents ? wallet : null;
    },
    `balance to settle at ${expectedCents} cents`,
    timeoutMs,
  );
}

/**
 * Publishes a wallet operation through the broker, exactly like the
 * game service does. Used as test fixture control (faucet/drain) while
 * still exercising the real consumer + inbox path.
 */
export async function publishWalletOperation(
  routingKey:
    | typeof ROUTING_KEYS.WALLET_CREDIT_REQUESTED
    | typeof ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
  amountCents: string,
  reason: string,
): Promise<void> {
  const envelope = createMessage(
    routingKey,
    {
      playerId: TEST_PLAYER_ID,
      roundId: `e2e-${crypto.randomUUID()}`,
      betId: `e2e-${crypto.randomUUID()}`,
      amountCents,
      reason,
    },
    new Date(),
  );
  const response = await fetch(`${RABBITMQ_API}/exchanges/%2f/crash.events/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from("admin:admin").toString("base64")}`,
    },
    body: JSON.stringify({
      properties: { content_type: "application/json" },
      routing_key: routingKey,
      payload: JSON.stringify(envelope),
      payload_encoding: "string",
    }),
  });
  if (!response.ok) {
    throw new Error(`RabbitMQ publish failed: ${response.status}`);
  }
}
