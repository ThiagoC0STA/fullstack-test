import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import {
  BetSchema,
  InboxRecordSchema,
  OutboxRecordSchema,
  RoundSchema,
  SeedChainEntrySchema,
} from "./entities";
import { Migration20260611000300 } from "./migrations/Migration20260611000300";
import { Migration20260611000400 } from "./migrations/Migration20260611000400";

export function buildOrmConfig(databaseUrl: string): ReturnType<typeof defineConfig> {
  return defineConfig({
    clientUrl: databaseUrl,
    entities: [
      RoundSchema,
      BetSchema,
      SeedChainEntrySchema,
      OutboxRecordSchema,
      InboxRecordSchema,
    ],
    extensions: [Migrator],
    migrations: {
      // Explicit list instead of filesystem discovery: Bun's fs.glob
      // does not support withFileTypes yet, which MikroORM v7 relies on.
      migrationsList: [
        { name: "Migration20260611000300", class: Migration20260611000300 },
        { name: "Migration20260611000400", class: Migration20260611000400 },
      ],
      transactional: true,
      snapshot: false,
    },
  });
}
