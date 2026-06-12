import { Migration } from "@mikro-orm/migrations";

/**
 * Adds the server-side auto cashout target to bets. The engine cashes a
 * bet out at this multiplier the instant the live curve reaches it, so
 * the trigger no longer depends on the client's network latency. The
 * bounds (1.01x..10000.00x) are enforced at the database level too.
 */
export class Migration20260611000400 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "bets" add column "auto_cashout_hundredths" int null;`);
    this.addSql(`
      alter table "bets" add constraint "bets_auto_cashout_within_limits"
        check (
          "auto_cashout_hundredths" is null
          or ("auto_cashout_hundredths" >= 101 and "auto_cashout_hundredths" <= 1000000)
        );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bets" drop constraint "bets_auto_cashout_within_limits";`);
    this.addSql(`alter table "bets" drop column "auto_cashout_hundredths";`);
  }
}
