"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addCents,
  WS_EVENTS,
  type BetCashedOutEvent,
  type BetPlacedEvent,
  type BetSettledEvent,
  type CentsString,
  type MultiplierTickEvent,
  type RoundBettingStartedEvent,
  type RoundCrashedEvent,
  type RoundSnapshot,
  type RoundStartedEvent,
  type WalletView,
} from "@crash/contracts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { sounds } from "@/lib/sounds";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

/**
 * Bridges the socket to the game store. REST seeds the initial state
 * (history + current round) so the page is complete even if the socket
 * takes a moment to connect.
 */
export function useGameSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void api.roundHistory().then(
      (items) => {
        if (!cancelled) {
          useGameStore.getState().setHistory(items);
        }
      },
      () => undefined,
    );
    void api.currentRound().then(
      (snapshot) => {
        if (!cancelled && snapshot && useGameStore.getState().phase === "idle") {
          useGameStore.getState().applySnapshot(snapshot);
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const store = () => useGameStore.getState();
    const isMine = (playerId: string) =>
      playerId === useAuthStore.getState().playerId;

    // Wallet credits (cashout payout, late-debit refund) are processed
    // asynchronously AFTER the game emits the bet event, so a single
    // refetch fired now would read the pre-credit balance. We reconcile
    // again once the outbox + consumer have had time to settle. A debit
    // settlement, by contrast, is already applied when its event fires,
    // so the immediate refetch there is correct.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const refetchPlayerData = () => {
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["myBets"] });
    };
    const reconcileWallet = (immediate: boolean) => {
      if (immediate) {
        refetchPlayerData();
      }
      timers.push(
        setTimeout(refetchPlayerData, 1500),
        setTimeout(refetchPlayerData, 3500),
      );
    };
    // reflect a payout the instant it is accepted, then reconcile
    const applyCashoutCredit = (payoutCents: CentsString | null) => {
      if (payoutCents) {
        queryClient.setQueryData<WalletView>(["wallet"], (old) =>
          old ? { ...old, balanceCents: addCents(old.balanceCents, payoutCents) } : old,
        );
      }
      // the bet is already cashed_out in the game DB, so the history can
      // refresh now; only the wallet credit is the asynchronous part
      void queryClient.invalidateQueries({ queryKey: ["myBets"] });
      reconcileWallet(false);
    };

    // the first connect is silent; only a real drop-and-recover toasts
    let hasDisconnected = false;
    const onConnect = () => {
      store().setConnected(true);
      if (hasDisconnected) {
        toast.success("Reconectado ao tempo real");
        hasDisconnected = false;
      }
    };
    const onDisconnect = () => {
      store().setConnected(false);
      hasDisconnected = true;
      toast.warning("Conexão perdida, reconectando…");
    };
    const onSnapshot = (snapshot: RoundSnapshot) => store().applySnapshot(snapshot);
    const onBettingStarted = (event: RoundBettingStartedEvent) =>
      store().applyBettingStarted(event);
    const onRoundStarted = (event: RoundStartedEvent) =>
      store().applyRoundStarted(event);
    const onTick = (event: MultiplierTickEvent) => store().applyTick(event);
    const onCrashed = (event: RoundCrashedEvent) => {
      const hadMyActiveBet = store().bets.some(
        (bet) => bet.status === "active" && isMine(bet.playerId),
      );
      store().applyCrashed(event);
      sounds.crash();
      if (hadMyActiveBet) {
        // a late-debit refund may still credit back; reconcile a beat later
        reconcileWallet(true);
      }
    };
    const onBetPlaced = (event: BetPlacedEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        sounds.betPlaced();
        // the bet is persisted in the same tx, so it shows up at once
        void queryClient.invalidateQueries({ queryKey: ["myBets"] });
      }
    };
    const onBetSettled = (event: BetSettledEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        // debit already applied when this fires; refund (if rejected) is async
        reconcileWallet(true);
      }
    };
    const onBetCashedOut = (event: BetCashedOutEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        sounds.cashOut();
        applyCashoutCredit(event.bet.payoutCents);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(WS_EVENTS.ROUND_SNAPSHOT, onSnapshot);
    socket.on(WS_EVENTS.ROUND_BETTING_STARTED, onBettingStarted);
    socket.on(WS_EVENTS.ROUND_STARTED, onRoundStarted);
    socket.on(WS_EVENTS.MULTIPLIER_TICK, onTick);
    socket.on(WS_EVENTS.ROUND_CRASHED, onCrashed);
    socket.on(WS_EVENTS.BET_PLACED, onBetPlaced);
    socket.on(WS_EVENTS.BET_SETTLED, onBetSettled);
    socket.on(WS_EVENTS.BET_CASHED_OUT, onBetCashedOut);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(WS_EVENTS.ROUND_SNAPSHOT, onSnapshot);
      socket.off(WS_EVENTS.ROUND_BETTING_STARTED, onBettingStarted);
      socket.off(WS_EVENTS.ROUND_STARTED, onRoundStarted);
      socket.off(WS_EVENTS.MULTIPLIER_TICK, onTick);
      socket.off(WS_EVENTS.ROUND_CRASHED, onCrashed);
      socket.off(WS_EVENTS.BET_PLACED, onBetPlaced);
      socket.off(WS_EVENTS.BET_SETTLED, onBetSettled);
      socket.off(WS_EVENTS.BET_CASHED_OUT, onBetCashedOut);
    };
  }, [queryClient]);
}
