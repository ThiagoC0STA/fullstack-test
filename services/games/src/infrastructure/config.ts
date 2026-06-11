import { positiveInt, requireEnv } from "@crash/platform";

export interface GamesServiceConfig {
  port: number;
  databaseUrl: string;
  rabbitMqUrl: string;
  keycloakJwksUrl: string;
  keycloakIssuer: string;
  bettingWindowMs: number;
  cooldownMs: number;
  tickIntervalMs: number;
  seedChainLength: number;
}

const DEFAULT_PORT = 4001;
const DEFAULT_BETTING_WINDOW_MS = 10_000;
const DEFAULT_COOLDOWN_MS = 4_000;
const DEFAULT_TICK_INTERVAL_MS = 100;
const DEFAULT_SEED_CHAIN_LENGTH = 2_000;

/** Fails fast at boot when the environment is incomplete or malformed. */
export function loadGamesServiceConfig(): GamesServiceConfig {
  return {
    port: positiveInt("PORT", DEFAULT_PORT),
    databaseUrl: requireEnv("DATABASE_URL"),
    rabbitMqUrl: requireEnv("RABBITMQ_URL"),
    keycloakJwksUrl: requireEnv("KEYCLOAK_JWKS_URL"),
    keycloakIssuer: requireEnv("KEYCLOAK_ISSUER"),
    bettingWindowMs: positiveInt("BETTING_WINDOW_MS", DEFAULT_BETTING_WINDOW_MS),
    cooldownMs: positiveInt("COOLDOWN_MS", DEFAULT_COOLDOWN_MS),
    tickIntervalMs: positiveInt("TICK_INTERVAL_MS", DEFAULT_TICK_INTERVAL_MS),
    seedChainLength: positiveInt("SEED_CHAIN_LENGTH", DEFAULT_SEED_CHAIN_LENGTH),
  };
}
