"use client";

import type { BetView } from "@crash/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="flex flex-col overflow-hidden lg:max-h-[42vh]">
      <CardHeader className="shrink-0">
        <CardTitle>Apostas da rodada</CardTitle>
        <span className="font-mono text-xs text-ink-3">{visible.length}</span>
      </CardHeader>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden
            className="text-edge-strong"
          >
            <path
              d="M6 36 L18 26 L26 30 L42 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="42" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 42 H42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="text-center">
            <p className="text-[13px] font-medium text-ink-2">Mesa vazia</p>
            <p className="mt-0.5 text-xs text-ink-3">
              Seja o primeiro a apostar nesta rodada
            </p>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-edge overflow-y-auto">
          {visible.map((bet) => {
            const mine = bet.playerId === playerId;
            return (
              <li
                key={bet.betId}
                className={cn(
                  "flex h-11 items-center justify-between gap-2 px-4",
                  mine && "bg-surface-2/50",
                  bet.status === "lost" && "opacity-50",
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-2 font-mono text-[11px] uppercase text-ink-2">
                    {bet.username.slice(0, 1)}
                  </span>
                  <span className="truncate text-[13px] text-ink">
                    {bet.username}
                    {mine && <span className="ml-1.5 text-[11px] text-accent">você</span>}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      bet.status === "cashed_out" ? "text-accent" : "text-ink-2",
                    )}
                  >
                    {bet.status === "cashed_out" && bet.payoutCents
                      ? formatMoney(bet.payoutCents)
                      : formatMoney(bet.amountCents)}
                  </span>
                  {statusBadge(bet)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
