import { BigIntType, EntitySchema } from "@mikro-orm/core";
import { LedgerEntry } from "../../domain/ledger-entry";
import { Wallet } from "../../domain/wallet";

/**
 * Persistence mapping lives here so the domain classes stay free of ORM
 * concerns. MikroORM hydrates instances without calling constructors,
 * so the domain invariants only run through the aggregate methods.
 *
 * All monetary columns are BIGINT mapped to strings: values never pass
 * through IEEE-754 on the way in or out of the database.
 */

interface OutboxRecordProps {
  id: string;
  routingKey: string;
  body: object;
  createdAt: Date;
  publishedAt: Date | null;
}

/** Transactional outbox row; the publisher loop drains unpublished rows. */
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

interface InboxRecordProps {
  messageId: string;
  type: string;
  processedAt: Date;
}

/** Inbox row keyed by messageId; the primary key is the dedup guard. */
export class InboxRecord {
  messageId: string;
  type: string;
  processedAt: Date;

  constructor(props: InboxRecordProps) {
    this.messageId = props.messageId;
    this.type = props.type;
    this.processedAt = props.processedAt;
  }
}

export const WalletSchema = new EntitySchema<Wallet>({
  class: Wallet,
  tableName: "wallets",
  properties: {
    id: { type: "uuid", primary: true },
    playerId: { type: "string", fieldName: "player_id", length: 64, unique: true },
    balanceCents: { type: new BigIntType("string"), fieldName: "balance_cents" },
    createdAt: { type: "datetime", fieldName: "created_at" },
    updatedAt: { type: "datetime", fieldName: "updated_at" },
  },
});

export const LedgerEntrySchema = new EntitySchema<LedgerEntry>({
  class: LedgerEntry,
  tableName: "wallet_ledger",
  properties: {
    id: { type: "uuid", primary: true },
    walletId: { type: "uuid", fieldName: "wallet_id", index: true },
    type: { type: "string", length: 10 },
    reason: { type: "string", length: 32 },
    amountCents: { type: new BigIntType("string"), fieldName: "amount_cents" },
    balanceAfterCents: {
      type: new BigIntType("string"),
      fieldName: "balance_after_cents",
    },
    betId: { type: "string", fieldName: "bet_id", length: 64, nullable: true },
    roundId: { type: "string", fieldName: "round_id", length: 64, nullable: true },
    messageId: { type: "string", fieldName: "message_id", length: 128, index: true },
    createdAt: { type: "datetime", fieldName: "created_at" },
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
