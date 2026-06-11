"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  WS_EVENTS,
  type BetCashedOutEvent,
  type BetPlacedEvent,
  type BetSettledEvent,
  type MultiplierTickEvent,
  type RoundBettingStartedEvent,
  type RoundCrashedEvent,
  type RoundSnapshot,
  type RoundStartedEvent,
} from "@crash/contracts";
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
    const invalidateWallet = () =>
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });

    const onConnect = () => store().setConnected(true);
    const onDisconnect = () => store().setConnected(false);
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
        invalidateWallet();
      }
    };
    const onBetPlaced = (event: BetPlacedEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        sounds.betPlaced();
      }
    };
    const onBetSettled = (event: BetSettledEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        invalidateWallet();
      }
    };
    const onBetCashedOut = (event: BetCashedOutEvent) => {
      store().applyBetEvent(event);
      if (isMine(event.bet.playerId)) {
        sounds.cashOut();
        invalidateWallet();
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
