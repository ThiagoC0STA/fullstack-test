import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { RoutingKey, WalletMessage } from "@crash/contracts";
import type { LedgerEntry } from "../../domain/ledger-entry";
import { Wallet } from "../../domain/wallet";
import type {
  InboxPort,
  LedgerRepositoryPort,
  OutboxPort,
  TransactionContext,
  TransactionalRunnerPort,
  WalletRepositoryPort,
} from "../../application/ports";
import { OutboxRecord } from "./entities";

class MikroOrmWalletRepository implements WalletRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  findByPlayerId(playerId: string): Promise<Wallet | null> {
    return this.em.findOne(Wallet, { playerId });
  }

  add(wallet: Wallet): Promise<void> {
    this.em.persist(wallet);
    return Promise.resolve();
  }
}

class MikroOrmLedgerRepository implements LedgerRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  append(entry: LedgerEntry): Promise<void> {
    this.em.persist(entry);
    return Promise.resolve();
  }
}

class MikroOrmInbox implements InboxPort {
  constructor(private readonly em: EntityManager) {}

  async recordIfNew(messageId: string, type: string, now: Date): Promise<boolean> {
    const result = await this.em.execute(
      `insert into "inbox_messages" ("message_id", "type", "processed_at")
       values (?, ?, ?) on conflict ("message_id") do nothing`,
      [messageId, type, now],
      "run",
    );
    return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  }
}

class MikroOrmOutbox implements OutboxPort {
  constructor(private readonly em: EntityManager) {}

  add(message: WalletMessage, routingKey: RoutingKey): Promise<void> {
    this.em.persist(
      new OutboxRecord({
        id: message.messageId,
        routingKey,
        body: message,
        createdAt: new Date(message.occurredAt),
        publishedAt: null,
      }),
    );
    return Promise.resolve();
  }
}

class MikroOrmTransactionContext implements TransactionContext {
  readonly wallets: WalletRepositoryPort;
  readonly ledger: LedgerRepositoryPort;
  readonly inbox: InboxPort;
  readonly outbox: OutboxPort;

  constructor(em: EntityManager) {
    this.wallets = new MikroOrmWalletRepository(em);
    this.ledger = new MikroOrmLedgerRepository(em);
    this.inbox = new MikroOrmInbox(em);
    this.outbox = new MikroOrmOutbox(em);
  }
}

/**
 * Adapter for TransactionalRunnerPort: everything inside `work` shares
 * one Postgres transaction through a forked EntityManager, so wallet
 * updates, ledger entries, inbox records and outbox messages commit or
 * roll back atomically.
 */
@Injectable()
export class MikroOrmTransactionalRunner implements TransactionalRunnerPort {
  constructor(private readonly orm: MikroORM) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const em = this.orm.em.fork() as EntityManager;
    return em.transactional((tem) =>
      work(new MikroOrmTransactionContext(tem as EntityManager)),
    );
  }
}
