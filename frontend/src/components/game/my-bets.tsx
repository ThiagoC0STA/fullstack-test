"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyBets } from "@/hooks/use-my-bets";
import { betResult } from "@/lib/bet-history";
import { formatMoney, formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

export function MyBets() {
  const status = useAuthStore((state) => state.status);
  const { data: bets, isLoading } = useMyBets();

  if (status !== "authenticated") {
    return null;
  }

  return (
    <Card className="flex flex-col overflow-hidden lg:max-h-[42vh]">
      <CardHeader className="shrink-0">
        <CardTitle>Minhas apostas</CardTitle>
        {bets && bets.length > 0 && (
          <span className="font-mono text-xs text-ink-3">{bets.length}</span>
        )}
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : !bets || bets.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-ink-2">Nenhuma aposta ainda</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Suas apostas aparecem aqui assim que a rodada liquida
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-edge overflow-y-auto">
          {bets.map((bet) => {
            const result = betResult(bet);
            const won = result.tone === "win";
            const lost = result.tone === "loss";
            return (
              <li
                key={bet.betId}
                className="flex h-11 items-center justify-between gap-2 px-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      won && "text-accent",
                      lost && "text-ink-3",
                      result.tone === "pending" && "text-ink-2",
                    )}
                  >
                    {result.multiplierHundredths
                      ? formatMultiplier(result.multiplierHundredths)
                      : "—"}
                  </span>
                  <span className="truncate text-[13px] text-ink-2">
                    {formatMoney(bet.amountCents)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {won && result.payoutCents && (
                    <span className="font-mono text-xs tabular-nums text-accent">
                      +{formatMoney(result.payoutCents)}
                    </span>
                  )}
                  {lost && (
                    <span className="font-mono text-xs tabular-nums text-danger">
                      −{formatMoney(bet.amountCents)}
                    </span>
                  )}
                  {won && <Badge variant="success">ganhou</Badge>}
                  {lost && <Badge variant="danger">crashou</Badge>}
                  {result.tone === "pending" && (
                    <Badge variant="pending">em jogo</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
