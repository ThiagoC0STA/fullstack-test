"use client";

import { Coins } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { formatMoney } from "@/lib/format";

export function WalletBadge() {
  const wallet = useWallet();

  if (wallet.isLoading) {
    return <Skeleton className="h-8 w-24" />;
  }
  if (!wallet.data) {
    return null;
  }

  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-edge bg-surface px-2.5">
      <Coins className="size-3.5 text-ink-3" aria-hidden />
      <span className="font-mono text-[13px] font-medium tabular-nums text-ink">
        {formatMoney(wallet.data.balanceCents)}
      </span>
    </div>
  );
}
