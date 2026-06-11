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
 *
 * Outbox/inbox rows come from @crash/platform and are re-exported so
 * the rest of this service keeps a single import surface.
 */
export {
  InboxRecord,
  InboxRecordSchema,
  OutboxRecord,
  OutboxRecordSchema,
} from "@crash/platform";

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

