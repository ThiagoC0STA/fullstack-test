import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import {
  InboxRecordSchema,
  LedgerEntrySchema,
  OutboxRecordSchema,
  WalletSchema,
} from "./entities";
import { Migration20260611000100 } from "./migrations/Migration20260611000100";
import { Migration20260611000200 } from "./migrations/Migration20260611000200";

export function buildOrmConfig(databaseUrl: string): ReturnType<typeof defineConfig> {
  return defineConfig({
    clientUrl: databaseUrl,
    entities: [WalletSchema, LedgerEntrySchema, OutboxRecordSchema, InboxRecordSchema],
    extensions: [Migrator],
    migrations: {
      // Explicit list instead of filesystem discovery: Bun's fs.glob
      // does not support withFileTypes yet, which MikroORM v7 relies on.
      migrationsList: [
        { name: "Migration20260611000100", class: Migration20260611000100 },
        { name: "Migration20260611000200", class: Migration20260611000200 },
      ],
      transactional: true,
      snapshot: false,
    },
  });
}
