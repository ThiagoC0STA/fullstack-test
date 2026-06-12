import type {
  ApiResponse,
  BetView,
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoundSnapshot,
  RoundVerification,
  WalletView,
} from "@crash/contracts";
import { useAuthStore } from "@/stores/auth-store";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: object;
  auth?: boolean;
}

/**
 * All traffic goes through the same-origin BFF proxy (`/api/proxy/*`).
 * The access token lives in an httpOnly cookie the browser attaches
 * automatically, so this client never reads or carries it.
 */
const PROXY_BASE = "/api/proxy";

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Skip the round trip when the UI already knows there is no session; the
  // proxy would just return 401 anyway.
  if (options.auth && useAuthStore.getState().status !== "authenticated") {
    throw new ApiError("Entre para continuar", 401);
  }

  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor", 0);
  }

  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) {
    throw new ApiError(json?.error ?? `Erro inesperado (${response.status})`, response.status);
  }
  return json.data as T;
}

export const api = {
  currentRound: () => request<RoundSnapshot | null>("/games/rounds/current"),
  roundHistory: () => request<RoundHistoryItem[]>("/games/rounds/history?page=1&limit=20"),
  verifyRound: (roundId: string) =>
    request<RoundVerification>(`/games/rounds/${roundId}/verify`),
  myWallet: () => request<WalletView>("/wallets/me", { auth: true }),
  openWallet: () => request<WalletView>("/wallets", { method: "POST", auth: true }),
  myBets: (limit = 12) =>
    request<PlayerBetHistoryItem[]>(`/games/bets/me?page=1&limit=${limit}`, {
      auth: true,
    }),
  placeBet: (amountCents: string, autoCashoutHundredths?: number | null) =>
    request<BetView>("/games/bet", {
      method: "POST",
      auth: true,
      body: { amountCents, autoCashoutHundredths: autoCashoutHundredths ?? null },
    }),
  cashOut: () => request<BetView>("/games/bet/cashout", { method: "POST", auth: true }),
};
