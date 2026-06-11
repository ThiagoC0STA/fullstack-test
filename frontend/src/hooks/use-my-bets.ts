"use client";

import { useQuery } from "@tanstack/react-query";
import type { PlayerBetHistoryItem } from "@crash/contracts";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

/**
 * The authenticated player's recent bets. Socket settlements invalidate
 * the ["myBets"] key from use-game-socket so the list stays in step with
 * the wallet without a manual refresh.
 */
export function useMyBets() {
  const status = useAuthStore((state) => state.status);
  return useQuery<PlayerBetHistoryItem[]>({
    queryKey: ["myBets"],
    enabled: status === "authenticated",
    queryFn: () => api.myBets(),
    staleTime: 5_000,
  });
}
