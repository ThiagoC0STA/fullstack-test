import { beforeEach, describe, expect, test } from "bun:test";
import type {
  BetView,
  RoundCrashedEvent,
  RoundHistoryItem,
  RoundSnapshot,
} from "@crash/contracts";
import { useGameStore } from "../src/stores/game-store";

function bet(overrides: Partial<BetView> = {}): BetView {
  return {
    betId: "bet-1",
    playerId: "player-1",
    username: "player",
    amountCents: "1000",
    status: "active",
    cashoutMultiplierHundredths: null,
    autoCashoutHundredths: null,
    payoutCents: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<RoundSnapshot> = {}): RoundSnapshot {
  return {
    roundId: "round-1",
    phase: "running",
    seedHash: "hash-1",
    bettingEndsAt: null,
    startedAt: "2026-06-11T12:00:00.000Z",
    multiplierHundredths: 150,
    crashPointHundredths: null,
    serverTime: "2026-06-11T12:00:02.000Z",
    bets: [],
    ...overrides,
  };
}

function crashedEvent(overrides: Partial<RoundCrashedEvent> = {}): RoundCrashedEvent {
  return {
    roundId: "round-1",
    crashPointHundredths: 254,
    serverSeed: "seed-1",
    seedHash: "hash-1",
    ...overrides,
  };
}

function historyItem(roundId: string): RoundHistoryItem {
  return {
    roundId,
    crashPointHundredths: 200,
    seedHash: `hash-${roundId}`,
    serverSeed: `seed-${roundId}`,
    crashedAt: "2026-06-11T12:00:00.000Z",
  };
}

const INITIAL = useGameStore.getState();

beforeEach(() => {
  useGameStore.setState(
    {
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
    },
    false,
  );
});

describe("setConnected", () => {
  test("toggles the connection flag", () => {
    INITIAL.setConnected(true);
    expect(useGameStore.getState().connected).toBe(true);
    INITIAL.setConnected(false);
    expect(useGameStore.getState().connected).toBe(false);
  });
});

describe("applySnapshot", () => {
  test("maps every field and parses timestamps", () => {
    INITIAL.applySnapshot(
      snapshot({ bets: [bet()], phase: "running", multiplierHundredths: 175 }),
    );
    const state = useGameStore.getState();
    expect(state.phase).toBe("running");
    expect(state.roundId).toBe("round-1");
    expect(state.seedHash).toBe("hash-1");
    expect(state.startedAtMs).toBe(Date.parse("2026-06-11T12:00:00.000Z"));
    expect(state.lastTickMultiplier).toBe(175);
    expect(state.bets).toHaveLength(1);
  });

  test("defaults the multiplier to 100 when absent", () => {
    INITIAL.applySnapshot(snapshot({ multiplierHundredths: null, phase: "betting" }));
    expect(useGameStore.getState().lastTickMultiplier).toBe(100);
  });

  test("derives clock skew from serverTime", () => {
    const serverTime = new Date(Date.now() + 5000).toISOString();
    INITIAL.applySnapshot(snapshot({ serverTime }));
    // skew should be ~5000ms; allow for test execution jitter
    expect(Math.abs(useGameStore.getState().clockSkewMs - 5000)).toBeLessThan(1000);
  });
});

describe("applyBettingStarted", () => {
  test("resets bets and enters the betting phase", () => {
    useGameStore.setState({ bets: [bet()], crashPointHundredths: 254 });
    INITIAL.applyBettingStarted({
      roundId: "round-2",
      seedHash: "hash-2",
      bettingEndsAt: "2026-06-11T12:00:10.000Z",
      serverTime: "2026-06-11T12:00:00.000Z",
    });
    const state = useGameStore.getState();
    expect(state.phase).toBe("betting");
    expect(state.roundId).toBe("round-2");
    expect(state.bets).toHaveLength(0);
    expect(state.crashPointHundredths).toBeNull();
    expect(state.lastTickMultiplier).toBe(100);
  });
});

describe("applyRoundStarted", () => {
  test("transitions to running for the current round", () => {
    useGameStore.setState({ roundId: "round-1", phase: "betting" });
    INITIAL.applyRoundStarted({
      roundId: "round-1",
      startedAt: "2026-06-11T12:00:05.000Z",
      serverTime: "2026-06-11T12:00:05.000Z",
    });
    const state = useGameStore.getState();
    expect(state.phase).toBe("running");
    expect(state.startedAtMs).toBe(Date.parse("2026-06-11T12:00:05.000Z"));
  });

  test("ignores events for a stale round", () => {
    useGameStore.setState({ roundId: "round-1", phase: "betting" });
    INITIAL.applyRoundStarted({
      roundId: "OTHER",
      startedAt: "2026-06-11T12:00:05.000Z",
      serverTime: "2026-06-11T12:00:05.000Z",
    });
    expect(useGameStore.getState().phase).toBe("betting");
  });
});

describe("applyTick", () => {
  test("updates the multiplier for the current round", () => {
    useGameStore.setState({ roundId: "round-1" });
    INITIAL.applyTick({ roundId: "round-1", multiplierHundredths: 312, elapsedMs: 5000 });
    expect(useGameStore.getState().lastTickMultiplier).toBe(312);
  });

  test("ignores ticks from a stale round", () => {
    useGameStore.setState({ roundId: "round-1", lastTickMultiplier: 100 });
    INITIAL.applyTick({ roundId: "OTHER", multiplierHundredths: 999, elapsedMs: 1 });
    expect(useGameStore.getState().lastTickMultiplier).toBe(100);
  });
});

describe("applyCrashed", () => {
  test("marks active bets as lost and keeps cashed-out bets", () => {
    useGameStore.setState({
      roundId: "round-1",
      bets: [
        bet({ betId: "a", status: "active" }),
        bet({ betId: "b", status: "cashed_out", payoutCents: "2000" }),
      ],
    });
    INITIAL.applyCrashed(crashedEvent());
    const state = useGameStore.getState();
    expect(state.phase).toBe("crashed");
    expect(state.crashPointHundredths).toBe(254);
    expect(state.bets.find((b) => b.betId === "a")?.status).toBe("lost");
    expect(state.bets.find((b) => b.betId === "b")?.status).toBe("cashed_out");
  });

  test("prepends the crashed round to history", () => {
    useGameStore.setState({ roundId: "round-1", history: [historyItem("old")] });
    INITIAL.applyCrashed(crashedEvent());
    const history = useGameStore.getState().history;
    expect(history[0]?.roundId).toBe("round-1");
    expect(history[1]?.roundId).toBe("old");
  });

  test("ignores a crash from a stale round", () => {
    useGameStore.setState({ roundId: "round-1", phase: "running" });
    INITIAL.applyCrashed(crashedEvent({ roundId: "OTHER" }));
    expect(useGameStore.getState().phase).toBe("running");
  });
});

describe("applyBetEvent", () => {
  test("inserts a new bet", () => {
    useGameStore.setState({ roundId: "round-1", bets: [] });
    INITIAL.applyBetEvent({ roundId: "round-1", bet: bet({ betId: "new" }) });
    expect(useGameStore.getState().bets).toHaveLength(1);
  });

  test("upserts an existing bet by betId without duplicating", () => {
    useGameStore.setState({
      roundId: "round-1",
      bets: [bet({ betId: "x", status: "pending_debit" })],
    });
    INITIAL.applyBetEvent({ roundId: "round-1", bet: bet({ betId: "x", status: "active" }) });
    const bets = useGameStore.getState().bets;
    expect(bets).toHaveLength(1);
    expect(bets[0]?.status).toBe("active");
  });

  test("ignores bet events from a stale round", () => {
    useGameStore.setState({ roundId: "round-1", bets: [] });
    INITIAL.applyBetEvent({ roundId: "OTHER", bet: bet() });
    expect(useGameStore.getState().bets).toHaveLength(0);
  });
});

describe("history limit", () => {
  test("setHistory caps at 20 items", () => {
    INITIAL.setHistory(Array.from({ length: 50 }, (_, i) => historyItem(`r${i}`)));
    expect(useGameStore.getState().history).toHaveLength(20);
  });

  test("repeated crashes never exceed the limit", () => {
    for (let i = 0; i < 30; i++) {
      useGameStore.setState({ roundId: `round-${i}` });
      INITIAL.applyCrashed(crashedEvent({ roundId: `round-${i}` }));
    }
    expect(useGameStore.getState().history).toHaveLength(20);
    expect(useGameStore.getState().history[0]?.roundId).toBe("round-29");
  });
});
