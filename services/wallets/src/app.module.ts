import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { RabbitMQModule } from "@golevelup/nestjs-rabbitmq";
import { CRASH_EVENTS_EXCHANGE } from "@crash/contracts";
import type { ClockPort, TransactionalRunnerPort } from "./application/ports";
import { GetWalletUseCase } from "./application/use-cases/get-wallet.use-case";
import { OpenWalletUseCase } from "./application/use-cases/open-wallet.use-case";
import { ProcessCreditUseCase } from "./application/use-cases/process-credit.use-case";
import { ProcessDebitUseCase } from "./application/use-cases/process-debit.use-case";
import {
  AUTH_CONFIG,
  KeycloakJwtGuard,
  OutboxPublisherService,
  SystemClock,
} from "@crash/platform";
import { loadWalletServiceConfig } from "./infrastructure/config";
import { CLOCK, TRANSACTIONAL_RUNNER, WALLET_CONFIG } from "./infrastructure/di-tokens";
import { buildOrmConfig } from "./infrastructure/persistence/mikro-orm.config";
import { MikroOrmTransactionalRunner } from "./infrastructure/persistence/transactional-runner";
import { WalletsController } from "./presentation/controllers/wallets.controller";
import { WalletOperationsConsumer } from "./presentation/consumers/wallet-operations.consumer";
import { WalletDomainExceptionFilter } from "./presentation/filters/domain-exception.filter";

const config = loadWalletServiceConfig();

@Module({
  imports: [
    MikroOrmModule.forRoot(buildOrmConfig(config.databaseUrl)),
    RabbitMQModule.forRoot({
      uri: config.rabbitMqUrl,
      exchanges: [{ name: CRASH_EVENTS_EXCHANGE, type: "topic" }],
      connectionInitOptions: { wait: true, timeout: 30000 },
    }),
  ],
  controllers: [WalletsController],
  providers: [
    { provide: WALLET_CONFIG, useValue: config },
    {
      provide: AUTH_CONFIG,
      useValue: { jwksUrl: config.keycloakJwksUrl, issuer: config.keycloakIssuer },
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: TRANSACTIONAL_RUNNER, useClass: MikroOrmTransactionalRunner },
    {
      provide: OpenWalletUseCase,
      useFactory: (runner: TransactionalRunnerPort, clock: ClockPort) =>
        new OpenWalletUseCase(runner, clock, config.initialBalanceCents),
      inject: [TRANSACTIONAL_RUNNER, CLOCK],
    },
    {
      provide: GetWalletUseCase,
      useFactory: (runner: TransactionalRunnerPort) => new GetWalletUseCase(runner),
      inject: [TRANSACTIONAL_RUNNER],
    },
    {
      provide: ProcessDebitUseCase,
      useFactory: (runner: TransactionalRunnerPort, clock: ClockPort) =>
        new ProcessDebitUseCase(runner, clock),
      inject: [TRANSACTIONAL_RUNNER, CLOCK],
    },
    {
      provide: ProcessCreditUseCase,
      useFactory: (runner: TransactionalRunnerPort, clock: ClockPort) =>
        new ProcessCreditUseCase(runner, clock),
      inject: [TRANSACTIONAL_RUNNER, CLOCK],
    },
    KeycloakJwtGuard,
    WalletOperationsConsumer,
    OutboxPublisherService,
    { provide: APP_FILTER, useClass: WalletDomainExceptionFilter },
  ],
})
export class AppModule {}
