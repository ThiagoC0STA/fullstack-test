import { beforeEach, describe, expect, test } from "bun:test";
import { WS_EVENTS, type RoundCrashedEvent } from "@crash/contracts";
import { CurrentRoundStore } from "../../src/application/current-round.store";
import { RoundEngine } from "../../src/application/round-engine";
import { Round } from "../../src/domain/round";
import { sha256Hex } from "../../src/domain/provably-fair/hashing";
import {
  FakeBroadcast,
  FakeContext,
  FakeInbox,
  FakeOutbox,
  FakeRoundRepository,
  FakeRunner,
  FakeSeedChain,
  MutableClock,
} from "./helpers/fakes";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const BETTING_WINDOW_MS = 10_000;
const COOLDOWN_MS = 3_000;

interface Harness {
  engine: RoundEngine;
  store: CurrentRoundStore;
  clock: MutableClock;
  broadcast: FakeBroadcast;
  repository: FakeRoundRepository;
  outbox: FakeOutbox;
  seeds: FakeSeedChain;
}

function buildHarness(): Harness {
  const store = new CurrentRoundStore();
  const clock = new MutableClock(NOW);
  const broadcast = new FakeBroadcast();
  const repository = new FakeRoundRepository();
  const outbox = new FakeOutbox();
  const seeds = new FakeSeedChain();
  const runner = new FakeRunner(new FakeContext(repository, outbox, new FakeInbox()));
  const engine = new RoundEngine(store, runner, seeds, broadcast, clock, {
    bettingWindowMs: BETTING_WINDOW_MS,
    cooldownMs: COOLDOWN_MS,
  });
  return { engine, store, clock, broadcast, repository, outbox, seeds };
}

let harness: Harness;

beforeEach(() => {
  harness = buildHarness();
});

describe("RoundEngine lifecycle", () => {
  test("first tick opens a betting round and publishes only the hash", async () => {
    await harness.engine.tick();

    const round = harness.store.current;
    expect(round?.phase).toBe("betting");
    expect(harness.repository.persistedRounds).toHaveLength(1);
    expect(harness.broadcast.names()).toEqual([WS_EVENTS.ROUND_BETTING_STARTED]);
    const event = harness.broadcast.last(WS_EVENTS.ROUND_BETTING_STARTED) as {
      seedHash: string;
    };
    expect(event.seedHash).toBe(round?.seedHash as string);
  });

  test("stays in betting until the window elapses", async () => {
    await harness.engine.tick();
    harness.clock.advance(BETTING_WINDOW_MS - 1);
    await harness.engine.tick();
    expect(harness.store.current?.phase).toBe("betting");

    harness.clock.advance(1);
    await harness.engine.tick();
    expect(harness.store.current?.phase).toBe("running");
    expect(harness.broadcast.names()).toContain(WS_EVENTS.ROUND_STARTED);
  });

  test("emits growing multiplier ticks while running", async () => {
    await harness.engine.tick();
    harness.clock.advance(BETTING_WINDOW_MS);
    await harness.engine.tick();

    harness.clock.advance(100);
    await harness.engine.tick();
    harness.clock.advance(5000);
    await harness.engine.tick();

    const ticks = harness.broadcast.events
      .filter((entry) => entry.event === WS_EVENTS.MULTIPLIER_TICK)
      .map((entry) => entry.payload as { multiplierHundredths: number });
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    const last = ticks[ticks.length - 1] as { multiplierHundredths: number };
    expect(last.multiplierHundredths).toBeGreaterThanOrEqual(100);
  });

  test("crashes at the predetermined instant and reveals the seed", async () => {
    await harness.engine.tick();
    const round = harness.store.current as Round;
    harness.clock.advance(BETTING_WINDOW_MS);
    await harness.engine.tick();

    harness.clock.advance(round.crashElapsedMs);
    await harness.engine.tick();

    expect(round.phase).toBe("crashed");
    const crashEvent = harness.broadcast.last(
      WS_EVENTS.ROUND_CRASHED,
    ) as RoundCrashedEvent;
    expect(crashEvent.serverSeed).toBe(round.serverSeed);
    expect(crashEvent.crashPointHundredths).toBe(round.crashPointHundredths);
    expect(sha256Hex(crashEvent.serverSeed)).toBe(crashEvent.seedHash);
  });

  test("waits for the cooldown before opening the next round", async () => {
    await harness.engine.tick();
    const first = harness.store.current as Round;
    harness.clock.advance(BETTING_WINDOW_MS);
    await harness.engine.tick();
    harness.clock.advance(first.crashElapsedMs);
    await harness.engine.tick();

    await harness.engine.tick();
    expect(harness.store.current?.id).toBe(first.id);

    harness.clock.advance(COOLDOWN_MS + 1);
    await harness.engine.tick();
    const second = harness.store.current as Round;
    expect(second.id).not.toBe(first.id);
    expect(second.phase).toBe("betting");
  });

  test("consumes the seed chain in reverse so each reveal pins history", async () => {
    await harness.engine.tick();
    const first = harness.store.current as Round;
    harness.clock.advance(BETTING_WINDOW_MS);
    await harness.engine.tick();
    harness.clock.advance(first.crashElapsedMs);
    await harness.engine.tick();
    harness.clock.advance(COOLDOWN_MS + 1);
    await harness.engine.tick();
    const second = harness.store.current as Round;

    expect(second.chainIndex).toBe(first.chainIndex - 1);
    expect(sha256Hex(second.serverSeed)).toBe(first.serverSeed);
  });
});

describe("RoundEngine.recoverUnfinishedRounds", () => {
  test("voids interrupted rounds and refunds bets that were debited", async () => {
    const interrupted = Round.openBetting({
      serverSeed: "seed-a",
      chainIndex: 9,
      bettingWindowMs: BETTING_WINDOW_MS,
      now: new Date(NOW.getTime() - 60_000),
    });
    const debited = interrupted.placeBet({
      playerId: "debited-player",
      username: "debited",
      amountCents: "1000",
      now: new Date(NOW.getTime() - 60_000),
    });
    debited.confirmDebit();
    interrupted.placeBet({
      playerId: "pending-player",
      username: "pending",
      amountCents: "500",
      now: new Date(NOW.getTime() - 60_000),
    });
    harness.repository.unfinished = [interrupted];

    await harness.engine.recoverUnfinishedRounds();

    expect(interrupted.phase).toBe("crashed");
    const refunds = harness.outbox.messages.filter(
      (entry) => entry.routingKey === "wallet.credit.requested",
    );
    expect(refunds).toHaveLength(1);
    const payload = refunds[0]?.message.payload as {
      playerId: string;
      reason: string;
      amountCents: string;
    };
    expect(payload.playerId).toBe("debited-player");
    expect(payload.reason).toBe("bet_refund");
    expect(payload.amountCents).toBe("1000");
  });
});
