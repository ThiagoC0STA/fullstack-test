import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { AmqpConnection } from "@golevelup/nestjs-rabbitmq";
import { CRASH_EVENTS_EXCHANGE } from "@crash/contracts";

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 20;

interface OutboxRow {
  id: string;
  routing_key: string;
  body: object;
}

/**
 * Drains the transactional outbox: rows are written in the same
 * transaction as the domain change, then published here. FOR UPDATE
 * SKIP LOCKED makes concurrent instances safe. If the process dies
 * between publish and commit the message is re-published later, which
 * is fine: delivery is at-least-once and consumers dedup via inbox.
 */
@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly orm: MikroORM,
    private readonly amqp: AmqpConnection,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const em = this.orm.em.fork() as EntityManager;
      await em.transactional(async (tem) => {
        const scopedEm = tem as EntityManager;
        const rows = await scopedEm.execute<OutboxRow[]>(
          `select "id", "routing_key", "body" from "outbox_messages"
           where "published_at" is null
           order by "created_at" asc
           limit ${BATCH_SIZE}
           for update skip locked`,
        );
        for (const row of rows) {
          await this.amqp.publish(CRASH_EVENTS_EXCHANGE, row.routing_key, row.body);
          await scopedEm.execute(
            `update "outbox_messages" set "published_at" = ? where "id" = ?`,
            [new Date(), row.id],
            "run",
          );
        }
      });
    } catch (error: unknown) {
      this.logger.error(
        "Outbox flush failed",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.flushing = false;
    }
  }
}
