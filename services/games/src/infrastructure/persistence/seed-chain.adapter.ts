import { Inject, Injectable, Logger } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { SeedChainPort } from "../../application/ports";
import {
  generateSeedChain,
  randomSecretHex,
} from "../../domain/provably-fair/hashing";
import type { GamesServiceConfig } from "../config";
import { GAMES_CONFIG } from "../di-tokens";
import { SeedChainEntry } from "./entities";

/**
 * Stores the provably fair chain in Postgres. Seeds are consumed from
 * the HIGHEST position down, which is the reverse of generation order:
 * each revealed seed is the sha256 preimage of the previous round's
 * seed, pinning the whole history to the chain.
 */
@Injectable()
export class MikroOrmSeedChain implements SeedChainPort {
  private readonly logger = new Logger(MikroOrmSeedChain.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(GAMES_CONFIG) private readonly config: GamesServiceConfig,
  ) {}

  async ensureAvailable(): Promise<void> {
    const em = this.orm.em.fork() as EntityManager;
    await em.transactional(async (tem) => {
      const scoped = tem as EntityManager;
      const remaining = await scoped.count(SeedChainEntry, { usedAt: null });
      if (remaining > 0) {
        return;
      }
      const maxRows = await scoped.execute<Array<{ max_pos: number | null }>>(
        `select max("position") as max_pos from "seed_chain"`,
      );
      const base = (maxRows[0]?.max_pos ?? -1) + 1;
      const chain = generateSeedChain(randomSecretHex(), this.config.seedChainLength);
      for (let i = 0; i < chain.length; i++) {
        scoped.persist(
          new SeedChainEntry({
            position: base + i,
            seed: chain[i] as string,
            usedAt: null,
          }),
        );
      }
      this.logger.log(
        `Generated a fresh seed chain of ${chain.length} seeds starting at position ${base}`,
      );
    });
  }

  async acquireNext(): Promise<{ seed: string; chainIndex: number }> {
    const em = this.orm.em.fork() as EntityManager;
    return em.transactional(async (tem) => {
      const scoped = tem as EntityManager;
      const rows = await scoped.execute<Array<{ position: number; seed: string }>>(
        `select "position", "seed" from "seed_chain"
         where "used_at" is null
         order by "position" desc
         limit 1
         for update skip locked`,
      );
      const row = rows[0];
      if (!row) {
        throw new Error("Seed chain exhausted; ensureAvailable must run first");
      }
      await scoped.execute(
        `update "seed_chain" set "used_at" = ? where "position" = ?`,
        [new Date(), row.position],
        "run",
      );
      return { seed: row.seed, chainIndex: row.position };
    });
  }
}
