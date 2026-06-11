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

interface OutboxRecordProps {
  id: string;
  routingKey: string;
  body: object;
  createdAt: Date;
  publishedAt: Date | null;
}

export class OutboxRecord {
  id: string;
  routingKey: string;
  body: object;
  createdAt: Date;
  publishedAt: Date | null;

  constructor(props: OutboxRecordProps) {
    this.id = props.id;
    this.routingKey = props.routingKey;
    this.body = props.body;
    this.createdAt = props.createdAt;
    this.publishedAt = props.publishedAt;
  }
}

export class InboxRecord {
  messageId: string;
  type: string;
  processedAt: Date;

  constructor(props: { messageId: string; type: string; processedAt: Date }) {
    this.messageId = props.messageId;
    this.type = props.type;
    this.processedAt = props.processedAt;
  }
}

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

export const OutboxRecordSchema = new EntitySchema<OutboxRecord>({
  class: OutboxRecord,
  tableName: "outbox_messages",
  properties: {
    id: { type: "uuid", primary: true },
    routingKey: { type: "string", fieldName: "routing_key", length: 64 },
    body: { type: "json" },
    createdAt: { type: "datetime", fieldName: "created_at" },
    publishedAt: { type: "datetime", fieldName: "published_at", nullable: true },
  },
});

export const InboxRecordSchema = new EntitySchema<InboxRecord>({
  class: InboxRecord,
  tableName: "inbox_messages",
  properties: {
    messageId: { type: "string", fieldName: "message_id", length: 128, primary: true },
    type: { type: "string", length: 64 },
    processedAt: { type: "datetime", fieldName: "processed_at" },
  },
});
