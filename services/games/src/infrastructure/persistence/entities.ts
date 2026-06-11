import { BigIntType, EntitySchema } from "@mikro-orm/core";
import { Bet } from "../../domain/bet";
import { Round } from "../../domain/round";

/**
 * Persistence mapping for the game service. Domain classes stay free of
 * ORM concerns; monetary columns are BIGINT mapped to strings.
 *
 * Round.bets is intentionally NOT mapped: bets are persisted and loaded
 * separately and reattached by the repository, which keeps the aggregate
 * pure while the engine drives it in memory.
 */

export class SeedChainEntry {
  position: number;
  seed: string;
  usedAt: Date | null;

  constructor(props: { position: number; seed: string; usedAt: Date | null }) {
    this.position = props.position;
    this.seed = props.seed;
    this.usedAt = props.usedAt;
  }
}

/**
 * Outbox/inbox rows come from @crash/platform and are re-exported so
 * the rest of this service keeps a single import surface.
 */
export {
  InboxRecord,
  InboxRecordSchema,
  OutboxRecord,
  OutboxRecordSchema,
} from "@crash/platform";

export const RoundSchema = new EntitySchema<Round>({
  class: Round,
  tableName: "rounds",
  properties: {
    id: { type: "uuid", primary: true },
    chainIndex: { type: "integer", fieldName: "chain_index" },
    serverSeed: { type: "string", fieldName: "server_seed", length: 64 },
    seedHash: { type: "string", fieldName: "seed_hash", length: 64 },
    crashPointHundredths: { type: "integer", fieldName: "crash_point_hundredths" },
    phase: { type: "string", length: 10 },
    bettingEndsAt: { type: "datetime", fieldName: "betting_ends_at" },
    startedAt: { type: "datetime", fieldName: "started_at", nullable: true },
    crashedAt: { type: "datetime", fieldName: "crashed_at", nullable: true },
    createdAt: { type: "datetime", fieldName: "created_at" },
    // domain-only members, never persisted: bets are loaded separately
    // by the repository and crashElapsedMs is derived from the seed
    bets: { type: "json", persist: false },
    crashElapsedMs: { type: "integer", persist: false, getter: true },
  },
});

export const BetSchema = new EntitySchema<Bet>({
  class: Bet,
  tableName: "bets",
  properties: {
    id: { type: "uuid", primary: true },
    roundId: { type: "uuid", fieldName: "round_id", index: true },
    playerId: { type: "string", fieldName: "player_id", length: 64 },
    username: { type: "string", length: 64 },
    amountCents: { type: new BigIntType("string"), fieldName: "amount_cents" },
    status: { type: "string", length: 16 },
    cashoutMultiplierHundredths: {
      type: "integer",
      fieldName: "cashout_multiplier_hundredths",
      nullable: true,
    },
    payoutCents: {
      type: new BigIntType("string"),
      fieldName: "payout_cents",
      nullable: true,
    },
    placedAt: { type: "datetime", fieldName: "placed_at" },
  },
});

export const SeedChainEntrySchema = new EntitySchema<SeedChainEntry>({
  class: SeedChainEntry,
  tableName: "seed_chain",
  properties: {
    position: { type: "integer", primary: true },
    seed: { type: "string", length: 64, unique: true },
    usedAt: { type: "datetime", fieldName: "used_at", nullable: true },
  },
});

