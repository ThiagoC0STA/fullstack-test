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
import { appConfig } from "./config";

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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth) {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      throw new ApiError("Entre para continuar", 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiUrl}${path}`, {
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
  placeBet: (amountCents: string) =>
    request<BetView>("/games/bet", { method: "POST", auth: true, body: { amountCents } }),
  cashOut: () => request<BetView>("/games/bet/cashout", { method: "POST", auth: true }),
};
