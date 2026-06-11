import { create } from "zustand";
import type {
  BetCashedOutEvent,
  BetPlacedEvent,
  BetSettledEvent,
  BetView,
  MultiplierHundredths,
  MultiplierTickEvent,
  RoundBettingStartedEvent,
  RoundCrashedEvent,
  RoundHistoryItem,
  RoundPhase,
  RoundSnapshot,
  RoundStartedEvent,
} from "@crash/contracts";

const HISTORY_LIMIT = 20;

interface GameState {
  connected: boolean;
  phase: RoundPhase | "idle";
  roundId: string | null;
  seedHash: string | null;
  bettingEndsAtMs: number | null;
  startedAtMs: number | null;
  /** serverTime - clientTime; keeps the local curve in sync. */
  clockSkewMs: number;
  lastTickMultiplier: MultiplierHundredths;
  crashPointHundredths: MultiplierHundredths | null;
  bets: BetView[];
  history: RoundHistoryItem[];

  setConnected: (connected: boolean) => void;
  applySnapshot: (snapshot: RoundSnapshot) => void;
  applyBettingStarted: (event: RoundBettingStartedEvent) => void;
  applyRoundStarted: (event: RoundStartedEvent) => void;
  applyTick: (event: MultiplierTickEvent) => void;
  applyCrashed: (event: RoundCrashedEvent) => void;
  applyBetEvent: (event: BetPlacedEvent | BetSettledEvent | BetCashedOutEvent) => void;
  setHistory: (items: RoundHistoryItem[]) => void;
}

function upsert(bets: BetView[], incoming: BetView): BetView[] {
  const index = bets.findIndex((bet) => bet.betId === incoming.betId);
  if (index === -1) {
    return [...bets, incoming];
  }
  return bets.map((bet, i) => (i === index ? incoming : bet));
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  phase: "idle",
  roundId: null,
  seedHash: null,
  bettingEndsAtMs: null,
  startedAtMs: null,
  clockSkewMs: 0,
  lastTickMultiplier: 100,
  crashPointHundredths: null,
  bets: [],
  history: [],

  setConnected: (connected) => set({ connected }),

  applySnapshot: (snapshot) =>
    set({
      phase: snapshot.phase,
      roundId: snapshot.roundId,
      seedHash: snapshot.seedHash,
      bettingEndsAtMs: snapshot.bettingEndsAt
        ? Date.parse(snapshot.bettingEndsAt)
        : null,
      startedAtMs: snapshot.startedAt ? Date.parse(snapshot.startedAt) : null,
      clockSkewMs: Date.parse(snapshot.serverTime) - Date.now(),
      lastTickMultiplier: snapshot.multiplierHundredths ?? 100,
      crashPointHundredths: snapshot.crashPointHundredths,
      bets: snapshot.bets,
    }),

  applyBettingStarted: (event) =>
    set({
      phase: "betting",
      roundId: event.roundId,
      seedHash: event.seedHash,
      bettingEndsAtMs: Date.parse(event.bettingEndsAt),
      startedAtMs: null,
      clockSkewMs: Date.parse(event.serverTime) - Date.now(),
      lastTickMultiplier: 100,
      crashPointHundredths: null,
      bets: [],
    }),

  applyRoundStarted: (event) => {
    if (event.roundId !== get().roundId) {
      return;
    }
    set({
      phase: "running",
      startedAtMs: Date.parse(event.startedAt),
      clockSkewMs: Date.parse(event.serverTime) - Date.now(),
    });
  },

  applyTick: (event) => {
    if (event.roundId !== get().roundId) {
      return;
    }
    set({ lastTickMultiplier: event.multiplierHundredths });
  },

  applyCrashed: (event) => {
    const state = get();
    if (event.roundId !== state.roundId) {
      return;
    }
    set({
      phase: "crashed",
      crashPointHundredths: event.crashPointHundredths,
      lastTickMultiplier: event.crashPointHundredths,
      bets: state.bets.map((bet) =>
        bet.status === "active" ? { ...bet, status: "lost" } : bet,
      ),
      history: [
        {
          roundId: event.roundId,
          crashPointHundredths: event.crashPointHundredths,
          seedHash: event.seedHash,
          serverSeed: event.serverSeed,
          crashedAt: new Date().toISOString(),
        },
        ...state.history,
      ].slice(0, HISTORY_LIMIT),
    });
  },

  applyBetEvent: (event) => {
    if (event.roundId !== get().roundId) {
      return;
    }
    set({ bets: upsert(get().bets, event.bet) });
  },

  setHistory: (items) => set({ history: items.slice(0, HISTORY_LIMIT) }),
}));
