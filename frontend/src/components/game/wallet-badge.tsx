"use client";

import { Coins } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { formatMoney } from "@/lib/format";

export function WalletBadge() {
  const wallet = useWallet();

  if (wallet.isLoading) {
    return <Skeleton className="h-9 w-28" />;
  }
  if (!wallet.data) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-border-soft bg-surface-2 px-3">
      <Coins className="size-4 text-gold" aria-hidden />
      <span className="font-mono text-sm font-bold text-ink">
        {formatMoney(wallet.data.balanceCents)}
      </span>
    </div>
  );
}
