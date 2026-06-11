import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { RoundEngine } from "../../application/round-engine";
import type { GamesServiceConfig } from "../config";
import { GAMES_CONFIG, ROUND_ENGINE } from "../di-tokens";

/**
 * Drives the framework-free RoundEngine: recovery once at boot, then
 * tick() on a fixed interval. Errors are logged and the loop keeps
 * going; a single bad tick must never stop the game.
 */
@Injectable()
export class RoundEngineHost implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RoundEngineHost.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(ROUND_ENGINE) private readonly engine: RoundEngine,
    @Inject(GAMES_CONFIG) private readonly config: GamesServiceConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.engine.recoverUnfinishedRounds();
    this.timer = setInterval(() => {
      this.engine.tick().catch((error: unknown) => {
        this.logger.error(
          "Engine tick failed",
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, this.config.tickIntervalMs);
    this.logger.log(
      `Round engine started (tick ${this.config.tickIntervalMs}ms, betting window ${this.config.bettingWindowMs}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
