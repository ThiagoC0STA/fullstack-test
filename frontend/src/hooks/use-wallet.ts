"use client";

import { useQuery } from "@tanstack/react-query";
import type { WalletView } from "@crash/contracts";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Opens the wallet on first login (idempotent POST) and keeps the
 * balance fresh; socket events invalidate this query on settlements.
 */
export function useWallet() {
  const status = useAuthStore((state) => state.status);
  return useQuery<WalletView>({
    queryKey: ["wallet"],
    enabled: status === "authenticated",
    queryFn: () => api.openWallet(),
    staleTime: 5_000,
  });
}
