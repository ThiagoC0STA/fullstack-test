import { EntitySchema } from "@mikro-orm/core";

/**
 * Outbox/inbox rows shared by every service. Each service maps these
 * onto its OWN database (same table names, different schemas), which
 * is what makes the transactional outbox pattern work per context.
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

/** Inbox row keyed by messageId; the primary key is the dedup guard. */
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
