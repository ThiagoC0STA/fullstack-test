import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { CRASH_EVENTS_EXCHANGE } from "@crash/contracts";
import { CurrentRoundStore } from "./application/current-round.store";
import type {
  ClockPort,
  GameBroadcastPort,
  SeedChainPort,
  TransactionalRunnerPort,
} from "./application/ports";
import { RoundEngine } from "./application/round-engine";
import { RoundQueries } from "./application/round-queries";
import { CashOutUseCase } from "./application/use-cases/cash-out.use-case";
import { HandleDebitSettledUseCase } from "./application/use-cases/handle-debit-settled.use-case";
import { PlaceBetUseCase } from "./application/use-cases/place-bet.use-case";
import { SystemClock } from "./infrastructure/clock";
import { loadGamesServiceConfig } from "./infrastructure/config";
import {
  CLOCK,
  GAME_BROADCAST,
  GAMES_CONFIG,
  ROUND_ENGINE,
  SEED_CHAIN,
  TRANSACTIONAL_RUNNER,
} from "./infrastructure/di-tokens";
import { KeycloakJwtGuard } from "./infrastructure/auth/keycloak-jwt.guard";
import { RoundEngineHost } from "./infrastructure/engine/round-engine.host";
import { OutboxPublisherService } from "./infrastructure/messaging/outbox-publisher.service";
import { buildOrmConfig } from "./infrastructure/persistence/mikro-orm.config";
import { MikroOrmSeedChain } from "./infrastructure/persistence/seed-chain.adapter";
import { MikroOrmTransactionalRunner } from "./infrastructure/persistence/transactional-runner";
import { GameGateway } from "./infrastructure/websocket/game.gateway";
import { GamesController } from "./presentation/controllers/games.controller";
import { WalletResultsConsumer } from "./presentation/consumers/wallet-results.consumer";
import { GameDomainExceptionFilter } from "./presentation/filters/domain-exception.filter";

const config = loadGamesServiceConfig();

@Module({
  imports: [
    MikroOrmModule.forRoot(buildOrmConfig(config.databaseUrl)),
    RabbitMQModule.forRoot({
      uri: config.rabbitMqUrl,
      exchanges: [{ name: CRASH_EVENTS_EXCHANGE, type: "topic" }],
      connectionInitOptions: { wait: true, timeout: 30000 },
    }),
  ],
  controllers: [GamesController],
  providers: [
    { provide: GAMES_CONFIG, useValue: config },
    { provide: CLOCK, useClass: SystemClock },
    { provide: TRANSACTIONAL_RUNNER, useClass: MikroOrmTransactionalRunner },
    { provide: SEED_CHAIN, useClass: MikroOrmSeedChain },
    CurrentRoundStore,
    GameGateway,
    { provide: GAME_BROADCAST, useExisting: GameGateway },
    {
      provide: ROUND_ENGINE,
      useFactory: (
        store: CurrentRoundStore,
        runner: TransactionalRunnerPort,
        seeds: SeedChainPort,
        broadcast: GameBroadcastPort,
        clock: ClockPort,
      ) =>
        new RoundEngine(store, runner, seeds, broadcast, clock, {
          bettingWindowMs: config.bettingWindowMs,
          cooldownMs: config.cooldownMs,
        }),
      inject: [CurrentRoundStore, TRANSACTIONAL_RUNNER, SEED_CHAIN, GAME_BROADCAST, CLOCK],
    },
    RoundEngineHost,
    {
      provide: PlaceBetUseCase,
      useFactory: (
        store: CurrentRoundStore,
        runner: TransactionalRunnerPort,
        broadcast: GameBroadcastPort,
        clock: ClockPort,
      ) => new PlaceBetUseCase(store, runner, broadcast, clock),
      inject: [CurrentRoundStore, TRANSACTIONAL_RUNNER, GAME_BROADCAST, CLOCK],
    },
    {
      provide: CashOutUseCase,
      useFactory: (
        store: CurrentRoundStore,
        runner: TransactionalRunnerPort,
        broadcast: GameBroadcastPort,
        clock: ClockPort,
      ) => new CashOutUseCase(store, runner, broadcast, clock),
      inject: [CurrentRoundStore, TRANSACTIONAL_RUNNER, GAME_BROADCAST, CLOCK],
    },
    {
      provide: HandleDebitSettledUseCase,
      useFactory: (
        store: CurrentRoundStore,
        runner: TransactionalRunnerPort,
        broadcast: GameBroadcastPort,
        clock: ClockPort,
      ) => new HandleDebitSettledUseCase(store, runner, broadcast, clock),
      inject: [CurrentRoundStore, TRANSACTIONAL_RUNNER, GAME_BROADCAST, CLOCK],
    },
    {
      provide: RoundQueries,
      useFactory: (
        store: CurrentRoundStore,
        runner: TransactionalRunnerPort,
        clock: ClockPort,
      ) => new RoundQueries(store, runner, clock),
      inject: [CurrentRoundStore, TRANSACTIONAL_RUNNER, CLOCK],
    },
    KeycloakJwtGuard,
    WalletResultsConsumer,
    OutboxPublisherService,
    { provide: APP_FILTER, useClass: GameDomainExceptionFilter },
  ],
})
export class AppModule {}
