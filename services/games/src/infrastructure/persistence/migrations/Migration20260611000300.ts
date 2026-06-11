import { Migration } from "@mikro-orm/migrations";

/**
 * Game service schema. Monetary columns are BIGINT; bet limits and the
 * one-bet-per-player rule are also enforced at the database level.
 */
export class Migration20260611000300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "rounds" (
        "id" uuid not null,
        "chain_index" int not null,
        "server_seed" varchar(64) not null,
        "seed_hash" varchar(64) not null,
        "crash_point_hundredths" int not null,
        "phase" varchar(10) not null,
        "betting_ends_at" timestamptz not null,
        "started_at" timestamptz null,
        "crashed_at" timestamptz null,
        "created_at" timestamptz not null,
        constraint "rounds_pkey" primary key ("id"),
        constraint "rounds_chain_index_unique" unique ("chain_index"),
        constraint "rounds_crash_point_min" check ("crash_point_hundredths" >= 100)
      );
    `);
    this.addSql(`
      create index "rounds_history_idx" on "rounds" ("crashed_at" desc)
        where "crashed_at" is not null;
    `);

    this.addSql(`
      create table "bets" (
        "id" uuid not null,
        "round_id" uuid not null,
        "player_id" varchar(64) not null,
        "username" varchar(64) not null,
        "amount_cents" bigint not null,
        "status" varchar(16) not null,
        "cashout_multiplier_hundredths" int null,
        "payout_cents" bigint null,
        "placed_at" timestamptz not null,
        constraint "bets_pkey" primary key ("id"),
        constraint "bets_round_fk" foreign key ("round_id") references "rounds" ("id"),
        constraint "bets_amount_within_limits" check ("amount_cents" >= 100 and "amount_cents" <= 100000),
        constraint "bets_payout_non_negative" check ("payout_cents" is null or "payout_cents" >= 0)
      );
    `);
    this.addSql(`create index "bets_round_id_idx" on "bets" ("round_id");`);
    this.addSql(`create index "bets_player_idx" on "bets" ("player_id", "placed_at" desc);`);
    this.addSql(`
      create unique index "bets_one_per_player_per_round"
        on "bets" ("round_id", "player_id")
        where "status" <> 'rejected';
    `);

    this.addSql(`
      create table "seed_chain" (
        "position" int not null,
        "seed" varchar(64) not null,
        "used_at" timestamptz null,
        constraint "seed_chain_pkey" primary key ("position"),
        constraint "seed_chain_seed_unique" unique ("seed")
      );
    `);
    this.addSql(`
      create index "seed_chain_unused_idx" on "seed_chain" ("position" desc)
        where "used_at" is null;
    `);

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
    this.addSql(`drop table if exists "seed_chain";`);
    this.addSql(`drop table if exists "bets";`);
    this.addSql(`drop table if exists "rounds";`);
  }
}
