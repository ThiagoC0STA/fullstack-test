"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BET_LIMITS,
  calculatePayoutCents,
  compareCents,
  decimalToCents,
  InvalidMoneyError,
} from "@crash/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLiveMultiplier } from "@/hooks/use-live-multiplier";
import { api, ApiError } from "@/lib/api";
import { formatMoney, formatMultiplier } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

const QUICK_AMOUNTS = ["1.00", "5.00", "25.00", "100.00", "1000.00"];

export function BetControls() {
  const authStatus = useAuthStore((state) => state.status);
  const playerId = useAuthStore((state) => state.playerId);
  const login = useAuthStore((state) => state.login);
  const phase = useGameStore((state) => state.phase);
  const bets = useGameStore((state) => state.bets);
  const bettingEndsAtMs = useGameStore((state) => state.bettingEndsAtMs);
  const clockSkewMs = useGameStore((state) => state.clockSkewMs);
  const multiplier = useLiveMultiplier();

  const [amount, setAmount] = useState("10.00");
  const [autoCashout, setAutoCashout] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoFiredRef = useRef(false);

  const myBet = playerId
    ? bets.find((bet) => bet.playerId === playerId && bet.status !== "rejected")
    : undefined;

  useEffect(() => {
    if (phase !== "betting" || !bettingEndsAtMs) {
      setCountdown(null);
      return;
    }
    const interval = setInterval(() => {
      const remaining = bettingEndsAtMs - (Date.now() + clockSkewMs);
      setCountdown(Math.max(0, remaining));
    }, 100);
    return () => clearInterval(interval);
  }, [phase, bettingEndsAtMs, clockSkewMs]);

  const placeBet = useMutation({
    mutationFn: (amountCents: string) => api.placeBet(amountCents),
    onSuccess: () => toast.success("Aposta enviada, debitando da carteira…"),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Falha ao apostar"),
  });

  const cashOut = useMutation({
    mutationFn: () => api.cashOut(),
    onSuccess: (bet) =>
      toast.success(
        `Sacou em ${formatMultiplier(bet.cashoutMultiplierHundredths ?? 100)} — ${formatMoney(bet.payoutCents ?? "0")}`,
      ),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Falha no cashout"),
  });

  // auto cashout: fires once when the live multiplier crosses the target
  useEffect(() => {
    if (phase !== "running" || !myBet || myBet.status !== "active") {
      autoFiredRef.current = false;
      return;
    }
    const target = Number.parseFloat(autoCashout);
    if (!Number.isFinite(target) || target < 1.01) {
      return;
    }
    const targetHundredths = Math.round(target * 100);
    if (multiplier >= targetHundredths && !autoFiredRef.current && !cashOut.isPending) {
      autoFiredRef.current = true;
      cashOut.mutate();
    }
  }, [phase, myBet, autoCashout, multiplier, cashOut]);

  const submitBet = () => {
    try {
      const cents = decimalToCents(amount.replace(",", "."));
      if (compareCents(cents, BET_LIMITS.MIN_CENTS) < 0) {
        toast.error("Aposta mínima: 1.00");
        return;
      }
      if (compareCents(cents, BET_LIMITS.MAX_CENTS) > 0) {
        toast.error("Aposta máxima: 1000.00");
        return;
      }
      placeBet.mutate(cents);
    } catch (error: unknown) {
      toast.error(
        error instanceof InvalidMoneyError
          ? "Valor inválido (use até 2 casas decimais)"
          : "Valor inválido",
      );
    }
  };

  if (authStatus !== "authenticated") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-ink-dim">Entre com sua conta para apostar</p>
          <Button size="lg" onClick={() => void login()}>
            Entrar para apostar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const potential = myBet
    ? calculatePayoutCents(myBet.amountCents, Math.max(100, multiplier))
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sua aposta</CardTitle>
        {countdown !== null && (
          <span className="font-mono text-xs text-neon">
            fecha em {(countdown / 1000).toFixed(1)}s
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-ink-dim">
              Valor ($)
            </label>
            <Input
              inputMode="decimal"
              value={amount}
              disabled={Boolean(myBet) || phase !== "betting"}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-ink-dim">
              Auto-saque (×)
            </label>
            <Input
              inputMode="decimal"
              placeholder="ex: 2.00"
              value={autoCashout}
              onChange={(event) => setAutoCashout(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <Button
              key={quick}
              variant="outline"
              size="sm"
              disabled={Boolean(myBet) || phase !== "betting"}
              onClick={() => setAmount(quick)}
            >
              {quick}
            </Button>
          ))}
        </div>

        {!myBet && (
          <Button
            size="lg"
            className="w-full"
            disabled={phase !== "betting" || placeBet.isPending}
            onClick={submitBet}
          >
            {phase === "betting"
              ? placeBet.isPending
                ? "Enviando…"
                : "Apostar"
              : "Aguardando próxima rodada…"}
          </Button>
        )}

        {myBet?.status === "pending_debit" && (
          <Button size="lg" className="w-full" disabled variant="outline">
            Debitando {formatMoney(myBet.amountCents)} da carteira…
          </Button>
        )}

        {myBet?.status === "active" && phase === "running" && (
          <Button
            size="lg"
            variant="default"
            className="w-full animate-pulse-glow"
            disabled={cashOut.isPending}
            onClick={() => cashOut.mutate()}
          >
            Sacar {potential ? formatMoney(potential) : ""} @{" "}
            {formatMultiplier(multiplier)}
          </Button>
        )}

        {myBet?.status === "active" && phase === "betting" && (
          <p className="rounded-lg bg-neon/10 p-3 text-center text-sm text-neon">
            Aposta de {formatMoney(myBet.amountCents)} confirmada — boa sorte!
          </p>
        )}

        {myBet?.status === "cashed_out" && (
          <p className="rounded-lg bg-neon/10 p-3 text-center text-sm font-semibold text-neon">
            Você sacou {formatMoney(myBet.payoutCents ?? "0")} em{" "}
            {formatMultiplier(myBet.cashoutMultiplierHundredths ?? 100)}
          </p>
        )}

        {myBet?.status === "lost" && (
          <p className="rounded-lg bg-danger/10 p-3 text-center text-sm font-semibold text-danger">
            Crashou… {formatMoney(myBet.amountCents)} perdidos. Próxima!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
