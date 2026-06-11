import type {
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoundSnapshot,
  RoundVerification,
} from "@crash/contracts";
import { CRASH_ALGORITHM_DESCRIPTION } from "../domain/provably-fair/crash-point";
import { CurrentRoundStore } from "./current-round.store";
import type { ClockPort, TransactionalRunnerPort } from "./ports";
import { toRoundSnapshot } from "./views";

/**
 * Read side of the game service. The current round comes straight from
 * the engine's memory; history and verification read the database.
 */
export class RoundQueries {
  constructor(
    private readonly store: CurrentRoundStore,
    private readonly runner: TransactionalRunnerPort,
    private readonly clock: ClockPort,
  ) {}

  getCurrentSnapshot(): RoundSnapshot | null {
    const round = this.store.current;
    if (!round) {
      return null;
    }
    return toRoundSnapshot(round, this.clock.now());
  }

  getHistory(input: {
    page: number;
    limit: number;
  }): Promise<{ items: RoundHistoryItem[]; total: number }> {
    return this.runner.run((tx) => tx.rounds.findCrashedPage(input));
  }

  /** Only crashed rounds are verifiable; the seed stays secret before. */
  async getVerification(roundId: string): Promise<RoundVerification | null> {
    const round = await this.runner.run((tx) => tx.rounds.findById(roundId));
    if (!round || round.phase !== "crashed") {
      return null;
    }
    return {
      roundId: round.id,
      seedHash: round.seedHash,
      serverSeed: round.serverSeed,
      crashPointHundredths: round.crashPointHundredths,
      algorithm: CRASH_ALGORITHM_DESCRIPTION,
    };
  }

  getPlayerBets(input: {
    playerId: string;
    page: number;
    limit: number;
  }): Promise<{ items: PlayerBetHistoryItem[]; total: number }> {
    return this.runner.run((tx) => tx.rounds.findPlayerBets(input));
  }
}
