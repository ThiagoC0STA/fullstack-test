import type { Round } from "../domain/round";

/**
 * Holds the authoritative in-memory round the engine is driving.
 * The game loop is single-instance by design (documented trade-off):
 * the database stays the durable record, while reads and invariant
 * checks hit memory for real-time latency.
 */
export class CurrentRoundStore {
  private round: Round | null = null;

  get current(): Round | null {
    return this.round;
  }

  set(round: Round | null): void {
    this.round = round;
  }
}
