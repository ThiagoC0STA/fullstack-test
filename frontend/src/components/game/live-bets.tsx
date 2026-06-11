"use client";

import type { BetView } from "@crash/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

function statusBadge(bet: BetView) {
  switch (bet.status) {
    case "pending_debit":
      return <Badge variant="pending">debitando</Badge>;
    case "active":
      return <Badge variant="neutral">em jogo</Badge>;
    case "cashed_out":
      return (
        <Badge variant="success">
          {formatMultiplier(bet.cashoutMultiplierHundredths ?? 100)}
        </Badge>
      );
    case "lost":
      return <Badge variant="danger">crashou</Badge>;
    default:
      return null;
  }
}

export function LiveBets() {
  const bets = useGameStore((state) => state.bets);
  const playerId = useAuthStore((state) => state.playerId);
  const visible = bets.filter((bet) => bet.status !== "rejected");

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Apostas da rodada</CardTitle>
        <span className="font-mono text-xs text-ink-dim">{visible.length}</span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-dim">
            Ninguém apostou ainda nesta rodada
          </p>
        )}
        {visible.map((bet) => {
          const mine = bet.playerId === playerId;
          return (
            <div
              key={bet.betId}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border border-transparent bg-surface-2/70 px-3 py-2",
                mine && "border-neon/40",
                bet.status === "cashed_out" && "bg-neon/5",
                bet.status === "lost" && "opacity-60",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-card font-mono text-xs uppercase text-neon">
                  {bet.username.slice(0, 1)}
                </span>
                <span className="truncate text-sm">
                  {bet.username}
                  {mine && <span className="ml-1 text-[10px] text-neon">(você)</span>}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs text-ink-dim">
                  {bet.status === "cashed_out" && bet.payoutCents
                    ? formatMoney(bet.payoutCents)
                    : formatMoney(bet.amountCents)}
                </span>
                {statusBadge(bet)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
