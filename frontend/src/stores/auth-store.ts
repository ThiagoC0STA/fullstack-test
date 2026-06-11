import { create } from "zustand";
import type { User } from "oidc-client-ts";
import { getUserManager } from "@/lib/auth";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  playerId: string | null;
  username: string | null;
  accessToken: string | null;
  initialize: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  applyUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  playerId: null,
  username: null,
  accessToken: null,

  applyUser: (user) => {
    if (!user || user.expired) {
      set({ status: "anonymous", playerId: null, username: null, accessToken: null });
      return;
    }
    const username =
      typeof user.profile.preferred_username === "string"
        ? user.profile.preferred_username
        : user.profile.sub;
    set({
      status: "authenticated",
      playerId: user.profile.sub,
      username,
      accessToken: user.access_token,
    });
  },

  initialize: async () => {
    const manager = getUserManager();
    manager.events.addUserLoaded((user) => get().applyUser(user));
    manager.events.addUserUnloaded(() => get().applyUser(null));
    manager.events.addSilentRenewError(() => get().applyUser(null));
    try {
      const user = await manager.getUser();
      get().applyUser(user);
    } catch {
      get().applyUser(null);
    }
  },

  login: async () => {
    await getUserManager().signinRedirect();
  },

  logout: async () => {
    await getUserManager().signoutRedirect();
  },
}));
