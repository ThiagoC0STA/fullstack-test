import {
  createMessage,
  ROUTING_KEYS,
  WS_EVENTS,
  type MultiplierTickEvent,
  type RoundBettingStartedEvent,
  type RoundCrashedEvent,
  type RoundStartedEvent,
  type WalletCreditRequestedPayload,
} from "@crash/contracts";
import { Round } from "../domain/round";
import { CurrentRoundStore } from "./current-round.store";
import type {
  ClockPort,
  GameBroadcastPort,
  SeedChainPort,
  TransactionalRunnerPort,
} from "./ports";

export interface RoundEngineConfig {
  bettingWindowMs: number;
  cooldownMs: number;
}

/**
 * Tick-driven state machine for the round lifecycle. The host calls
 * tick() on an interval; the engine reacts to the injected clock, which
 * keeps the whole lifecycle deterministic under test.
 *
 * betting --(window elapses)--> running --(predetermined instant)-->
 * crashed --(cooldown)--> next betting round.
 */
export class RoundEngine {
  private cooldownUntil: Date | null = null;
  private transitioning = false;

  constructor(
    private readonly store: CurrentRoundStore,
    private readonly runner: TransactionalRunnerPort,
    private readonly seeds: SeedChainPort,
    private readonly broadcast: GameBroadcastPort,
    private readonly clock: ClockPort,
    private readonly config: RoundEngineConfig,
  ) {}

  /**
   * Crash recovery: rounds interrupted by a restart are voided and
   * every bet that already cost the player money is refunded through
   * the wallet saga (compensation, not manual fixing).
   */
  async recoverUnfinishedRounds(): Promise<void> {
    const now = this.clock.now();
    await this.runner.run(async (tx) => {
      const unfinished = await tx.rounds.findUnfinished();
      for (const round of unfinished) {
        if (round.phase === "betting") {
          round.start(now);
        }
        const interrupted = round.bets.filter(
          (bet) => bet.status === "active" || bet.status === "pending_debit",
        );
        round.crash(now);
        await tx.rounds.persistRound(round);
        for (const bet of interrupted) {
          if (bet.status === "lost") {
            // was active: money already left the wallet, give it back
            const payload: WalletCreditRequestedPayload = {
              playerId: bet.playerId,
              roundId: round.id,
              betId: bet.id,
              amountCents: bet.amountCents,
              reason: "bet_refund",
            };
            await tx.outbox.add(
              createMessage(ROUTING_KEYS.WALLET_CREDIT_REQUESTED, payload, now),
              ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
            );
          }
          await tx.rounds.persistBet(bet);
        }
      }
    });
  }

  async tick(): Promise<void> {
    if (this.transitioning) {
      return;
    }
    const now = this.clock.now();
    const round = this.store.current;

    if (!round || round.phase === "crashed") {
      if (this.cooldownUntil && now < this.cooldownUntil) {
        return;
      }
      await this.openNextRound(now);
      return;
    }

    if (round.phase === "betting") {
      if (now >= round.bettingEndsAt) {
        await this.startRound(round, now);
      }
      return;
    }

    if (round.hasReachedCrashPoint(now)) {
      await this.crashRound(round);
      return;
    }

    const tick: MultiplierTickEvent = {
      roundId: round.id,
      multiplierHundredths: round.multiplierAt(now),
      elapsedMs: now.getTime() - (round.startedAt as Date).getTime(),
    };
    this.broadcast.emit(WS_EVENTS.MULTIPLIER_TICK, tick);
  }

  private async openNextRound(now: Date): Promise<void> {
    this.transitioning = true;
    try {
      await this.seeds.ensureAvailable();
      const { seed, chainIndex } = await this.seeds.acquireNext();
      const round = Round.openBetting({
        serverSeed: seed,
        chainIndex,
        bettingWindowMs: this.config.bettingWindowMs,
        now,
      });
      await this.runner.run((tx) => tx.rounds.persistRound(round));
      this.store.set(round);
      this.cooldownUntil = null;

      const event: RoundBettingStartedEvent = {
        roundId: round.id,
        seedHash: round.seedHash,
        bettingEndsAt: round.bettingEndsAt.toISOString(),
        serverTime: now.toISOString(),
      };
      this.broadcast.emit(WS_EVENTS.ROUND_BETTING_STARTED, event);
    } finally {
      this.transitioning = false;
    }
  }

  private async startRound(round: Round, now: Date): Promise<void> {
    this.transitioning = true;
    try {
      round.start(now);
      await this.runner.run((tx) => tx.rounds.persistRound(round));

      const event: RoundStartedEvent = {
        roundId: round.id,
        startedAt: (round.startedAt as Date).toISOString(),
        serverTime: now.toISOString(),
      };
      this.broadcast.emit(WS_EVENTS.ROUND_STARTED, event);
    } finally {
      this.transitioning = false;
    }
  }

  private async crashRound(round: Round): Promise<void> {
    this.transitioning = true;
    try {
      // The crash instant is predetermined; use it instead of the tick
      // time so the recorded crash never depends on timer jitter.
      const crashAt = new Date(
        (round.startedAt as Date).getTime() + round.crashElapsedMs,
      );
      const losers = round.crash(crashAt);
      await this.runner.run(async (tx) => {
        await tx.rounds.persistRound(round);
        for (const bet of losers) {
          await tx.rounds.persistBet(bet);
        }
      });
      this.cooldownUntil = new Date(crashAt.getTime() + this.config.cooldownMs);

      const event: RoundCrashedEvent = {
        roundId: round.id,
        crashPointHundredths: round.crashPointHundredths,
        serverSeed: round.serverSeed,
        seedHash: round.seedHash,
      };
      this.broadcast.emit(WS_EVENTS.ROUND_CRASHED, event);
    } finally {
      this.transitioning = false;
    }
  }
}
