import { Migration } from "@mikro-orm/migrations";

/**
 * Seeds the wallet for the Keycloak test user (player / player123).
 * The user id is pinned in docker/keycloak/realm-export.json so the
 * challenge requirement "test user with wallet balance" holds on a
 * fresh docker:up with zero manual steps.
 */
const TEST_PLAYER_ID = "11111111-1111-1111-1111-111111111111";
const TEST_WALLET_ID = "22222222-2222-2222-2222-222222222222";
const TEST_LEDGER_ID = "33333333-3333-3333-3333-333333333333";
const INITIAL_BALANCE_CENTS = "100000";

export class Migration20260611000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      insert into "wallets" ("id", "player_id", "balance_cents", "created_at", "updated_at")
      values ('${TEST_WALLET_ID}', '${TEST_PLAYER_ID}', ${INITIAL_BALANCE_CENTS}, now(), now())
      on conflict ("player_id") do nothing;
    `);
    this.addSql(`
      insert into "wallet_ledger"
        ("id", "wallet_id", "type", "reason", "amount_cents", "balance_after_cents",
         "bet_id", "round_id", "message_id", "created_at")
      values
        ('${TEST_LEDGER_ID}', '${TEST_WALLET_ID}', 'credit', 'initial_grant',
         ${INITIAL_BALANCE_CENTS}, ${INITIAL_BALANCE_CENTS}, null, null,
         'seed:test-player', now())
      on conflict ("id") do nothing;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "wallet_ledger" where "id" = '${TEST_LEDGER_ID}';`);
    this.addSql(`delete from "wallets" where "id" = '${TEST_WALLET_ID}';`);
  }
}
