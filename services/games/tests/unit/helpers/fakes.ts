import type {
  PlayerBetHistoryItem,
  RoundHistoryItem,
  RoutingKey,
  WalletCreditRequestedMessage,
  WalletDebitRequestedMessage,
  WsEvent,
} from "@crash/contracts";
import type { Bet } from "../../../src/domain/bet";
import type { Round } from "../../../src/domain/round";
import type {
  ClockPort,
  GameBroadcastPort,
  InboxPort,
  OutboxPort,
  RoundRepositoryPort,
  SeedChainPort,
  TransactionContext,
  TransactionalRunnerPort,
} from "../../../src/application/ports";
import { generateSeedChain } from "../../../src/domain/provably-fair/hashing";

export class MutableClock implements ClockPort {
  constructor(private value: Date) {}

  now(): Date {
    return this.value;
  }

  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class FakeSeedChain implements SeedChainPort {
  readonly chain: string[];
  private cursor: number;

  constructor(secret = "test-secret", length = 10) {
    this.chain = generateSeedChain(secret, length);
    this.cursor = length - 1;
  }

  ensureAvailable(): Promise<void> {
    return Promise.resolve();
  }

  acquireNext(): Promise<{ seed: string; chainIndex: number }> {
    const chainIndex = this.cursor;
    this.cursor -= 1;
    return Promise.resolve({ seed: this.chain[chainIndex] as string, chainIndex });
  }
}

export class FakeRoundRepository implements RoundRepositoryPort {
  persistedRounds: Round[] = [];
  persistedBets: Bet[] = [];
  unfinished: Round[] = [];
  byId = new Map<string, Round>();

  persistRound(round: Round): Promise<void> {
    this.persistedRounds.push(round);
    this.byId.set(round.id, round);
    return Promise.resolve();
  }

  persistBet(bet: Bet): Promise<void> {
    this.persistedBets.push(bet);
    return Promise.resolve();
  }

  findUnfinished(): Promise<Round[]> {
    return Promise.resolve(this.unfinished);
  }

  findById(roundId: string): Promise<Round | null> {
    return Promise.resolve(this.byId.get(roundId) ?? null);
  }

  findCrashedPage(): Promise<{ items: RoundHistoryItem[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 });
  }

  findPlayerBets(): Promise<{ items: PlayerBetHistoryItem[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 });
  }
}

export class FakeOutbox implements OutboxPort {
  messages: Array<{
    message: WalletDebitRequestedMessage | WalletCreditRequestedMessage;
    routingKey: RoutingKey;
  }> = [];

  add(
    message: WalletDebitRequestedMessage | WalletCreditRequestedMessage,
    routingKey: RoutingKey,
  ): Promise<void> {
    this.messages.push({ message, routingKey });
    return Promise.resolve();
  }
}

export class FakeInbox implements InboxPort {
  seen = new Set<string>();

  recordIfNew(messageId: string): Promise<boolean> {
    if (this.seen.has(messageId)) {
      return Promise.resolve(false);
    }
    this.seen.add(messageId);
    return Promise.resolve(true);
  }
}

export class FakeBroadcast implements GameBroadcastPort {
  events: Array<{ event: WsEvent; payload: object }> = [];

  emit(event: WsEvent, payload: object): void {
    this.events.push({ event, payload });
  }

  names(): WsEvent[] {
    return this.events.map((entry) => entry.event);
  }

  last(event: WsEvent): object | undefined {
    return [...this.events].reverse().find((entry) => entry.event === event)?.payload;
  }
}

export class FakeContext implements TransactionContext {
  constructor(
    readonly rounds: FakeRoundRepository,
    readonly outbox: FakeOutbox,
    readonly inbox: FakeInbox,
  ) {}
}

export class FakeRunner implements TransactionalRunnerPort {
  constructor(
    private readonly context: FakeContext,
    private readonly failNext: { value: boolean } = { value: false },
    private readonly failCommitNext: { value: boolean } = { value: false },
  ) {}

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    if (this.failNext.value) {
      this.failNext.value = false;
      throw new Error("simulated transaction failure");
    }
    const result = await work(this.context);
    if (this.failCommitNext.value) {
      this.failCommitNext.value = false;
      throw new Error("simulated commit failure");
    }
    return result;
  }
}
