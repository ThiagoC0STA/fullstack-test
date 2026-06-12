import { create } from "zustand";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface SessionResponse {
  authenticated: boolean;
  playerId?: string;
  username?: string;
}

interface AuthState {
  status: AuthStatus;
  playerId: string | null;
  username: string | null;
  initialize: () => Promise<void>;
  login: () => void;
  logout: () => void;
}

/**
 * Auth is owned by the BFF (httpOnly cookies). The client only learns who
 * it is from `/api/auth/session`; the access token never reaches JS, which
 * removes the XSS token-theft surface entirely.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  playerId: null,
  username: null,

  initialize: async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await response.json()) as SessionResponse;
      if (session.authenticated && session.playerId) {
        set({
          status: "authenticated",
          playerId: session.playerId,
          username: session.username ?? session.playerId,
        });
        return;
      }
    } catch {
      // fall through to anonymous
    }
    set({ status: "anonymous", playerId: null, username: null });
  },

  login: () => {
    window.location.href = "/api/auth/login";
  },

  logout: () => {
    window.location.href = "/api/auth/logout";
  },
}));
