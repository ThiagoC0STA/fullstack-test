import { Migration } from "@mikro-orm/migrations";

/**
 * Initial wallet service schema. Hand-written so every monetary column
 * is explicitly BIGINT and the non-negative balance invariant is also
 * enforced at the database level (third line of defense after domain
 * and application).
 */
export class Migration20260611000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "wallets" (
        "id" uuid not null,
        "player_id" varchar(64) not null,
        "balance_cents" bigint not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "wallets_pkey" primary key ("id"),
        constraint "wallets_player_id_unique" unique ("player_id"),
        constraint "wallets_balance_non_negative" check ("balance_cents" >= 0)
      );
    `);

    this.addSql(`
      create table "wallet_ledger" (
        "id" uuid not null,
        "wallet_id" uuid not null,
        "type" varchar(10) not null,
        "reason" varchar(32) not null,
        "amount_cents" bigint not null,
        "balance_after_cents" bigint not null,
        "bet_id" varchar(64) null,
        "round_id" varchar(64) null,
        "message_id" varchar(128) not null,
        "created_at" timestamptz not null,
        constraint "wallet_ledger_pkey" primary key ("id"),
        constraint "wallet_ledger_wallet_fk" foreign key ("wallet_id") references "wallets" ("id"),
        constraint "wallet_ledger_amount_positive" check ("amount_cents" > 0),
        constraint "wallet_ledger_balance_after_non_negative" check ("balance_after_cents" >= 0)
      );
    `);
    this.addSql(`create index "wallet_ledger_wallet_id_idx" on "wallet_ledger" ("wallet_id");`);
    this.addSql(`create index "wallet_ledger_message_id_idx" on "wallet_ledger" ("message_id");`);

    this.addSql(`
      create table "outbox_messages" (
        "id" uuid not null,
        "routing_key" varchar(64) not null,
        "body" jsonb not null,
        "created_at" timestamptz not null,
        "published_at" timestamptz null,
        constraint "outbox_messages_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create index "outbox_messages_unpublished_idx"
        on "outbox_messages" ("created_at")
        where "published_at" is null;
    `);

    this.addSql(`
      create table "inbox_messages" (
        "message_id" varchar(128) not null,
        "type" varchar(64) not null,
        "processed_at" timestamptz not null,
        constraint "inbox_messages_pkey" primary key ("message_id")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inbox_messages";`);
    this.addSql(`drop table if exists "outbox_messages";`);
    this.addSql(`drop table if exists "wallet_ledger";`);
    this.addSql(`drop table if exists "wallets";`);
  }
}
