import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import type {
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoutingKey,
  WalletCreditRequestedMessage,
  WalletDebitRequestedMessage,
} from "@crash/contracts";
import { Bet } from "../../domain/bet";
import { Round } from "../../domain/round";
import type {
  InboxPort,
  OutboxPort,
  RoundRepositoryPort,
  TransactionContext,
  TransactionalRunnerPort,
} from "../../application/ports";
import { OutboxRecord } from "./entities";

interface PlayerBetRow {
  id: string;
  round_id: string;
  amount_cents: string;
  status: PlayerBetHistoryItem["status"];
  cashout_multiplier_hundredths: number | null;
  payout_cents: string | null;
  placed_at: string | Date;
  round_phase: string;
  crash_point_hundredths: number;
}

class MikroOrmRoundRepository implements RoundRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async persistRound(round: Round): Promise<void> {
    await this.em.upsert(Round, {
      id: round.id,
      chainIndex: round.chainIndex,
      serverSeed: round.serverSeed,
      seedHash: round.seedHash,
      crashPointHundredths: round.crashPointHundredths,
      phase: round.phase,
      bettingEndsAt: round.bettingEndsAt,
      startedAt: round.startedAt,
      crashedAt: round.crashedAt,
      createdAt: round.createdAt,
    });
  }

  async persistBet(bet: Bet): Promise<void> {
    await this.em.upsert(Bet, {
      id: bet.id,
      roundId: bet.roundId,
      playerId: bet.playerId,
      username: bet.username,
      amountCents: bet.amountCents,
      status: bet.status,
      cashoutMultiplierHundredths: bet.cashoutMultiplierHundredths,
      payoutCents: bet.payoutCents,
      placedAt: bet.placedAt,
    });
  }

  async findUnfinished(): Promise<Round[]> {
    const rounds = await this.em.find(Round, { phase: { $ne: "crashed" } });
    for (const round of rounds) {
      round.bets = await this.em.find(Bet, { roundId: round.id });
    }
    return rounds;
  }

  async findById(roundId: string): Promise<Round | null> {
    const round = await this.em.findOne(Round, { id: roundId });
    if (!round) {
      return null;
    }
    round.bets = await this.em.find(Bet, { roundId: round.id });
    return round;
  }

  async findCrashedPage(input: {
    page: number;
    limit: number;
  }): Promise<{ items: RoundHistoryItem[]; total: number }> {
    const [rounds, total] = await this.em.findAndCount(
      Round,
      { phase: "crashed" },
      {
        orderBy: { crashedAt: "desc" },
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      },
    );
    return {
      items: rounds.map((round) => ({
        roundId: round.id,
        crashPointHundredths: round.crashPointHundredths,
        seedHash: round.seedHash,
        serverSeed: round.serverSeed,
        crashedAt: (round.crashedAt as Date).toISOString(),
      })),
      total,
    };
  }

  async findPlayerBets(input: {
    playerId: string;
    page: number;
    limit: number;
  }): Promise<{ items: PlayerBetHistoryItem[]; total: number }> {
    const offset = (input.page - 1) * input.limit;
    const rows = await this.em.execute<PlayerBetRow[]>(
      `select b."id", b."round_id", b."amount_cents", b."status",
              b."cashout_multiplier_hundredths", b."payout_cents", b."placed_at",
              r."phase" as round_phase, r."crash_point_hundredths"
       from "bets" b
       join "rounds" r on r."id" = b."round_id"
       where b."player_id" = ?
       order by b."placed_at" desc
       limit ${input.limit} offset ${offset}`,
      [input.playerId],
    );
    const countRows = await this.em.execute<Array<{ total: string }>>(
      `select count(*) as total from "bets" where "player_id" = ?`,
      [input.playerId],
    );
    return {
      items: rows.map((row) => ({
        betId: row.id,
        roundId: row.round_id,
        amountCents: row.amount_cents,
        status: row.status,
        cashoutMultiplierHundredths: row.cashout_multiplier_hundredths,
        payoutCents: row.payout_cents,
        // never leak the crash point of a round that has not crashed yet
        crashPointHundredths:
          row.round_phase === "crashed" ? row.crash_point_hundredths : null,
        placedAt: new Date(row.placed_at).toISOString(),
      })),
      total: Number(countRows[0]?.total ?? 0),
    };
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

  add(
    message: WalletDebitRequestedMessage | WalletCreditRequestedMessage,
    routingKey: RoutingKey,
  ): Promise<void> {
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
  readonly rounds: RoundRepositoryPort;
  readonly outbox: OutboxPort;
  readonly inbox: InboxPort;

  constructor(em: EntityManager) {
    this.rounds = new MikroOrmRoundRepository(em);
    this.outbox = new MikroOrmOutbox(em);
    this.inbox = new MikroOrmInbox(em);
  }
}

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
