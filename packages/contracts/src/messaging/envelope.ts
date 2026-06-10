/**
 * Every message published to the broker is wrapped in this envelope.
 * `messageId` is globally unique and lets consumers deduplicate via an
 * inbox table (at-least-once delivery, exactly-once processing).
 */
export interface MessageEnvelope<TType extends string, TPayload> {
  messageId: string;
  type: TType;
  /** ISO-8601 timestamp of when the event occurred at the producer. */
  occurredAt: string;
  payload: TPayload;
}
