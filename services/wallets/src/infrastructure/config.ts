import { isCents } from "@crash/contracts";

export interface WalletServiceConfig {
  port: number;
  databaseUrl: string;
  rabbitMqUrl: string;
  keycloakJwksUrl: string;
  keycloakIssuer: string;
  initialBalanceCents: string;
}

const DEFAULT_PORT = 4002;
const DEFAULT_INITIAL_BALANCE_CENTS = "100000";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Fails fast at boot when the environment is incomplete or malformed. */
export function loadWalletServiceConfig(): WalletServiceConfig {
  const initialBalanceCents =
    process.env.WALLET_INITIAL_BALANCE_CENTS ?? DEFAULT_INITIAL_BALANCE_CENTS;
  if (!isCents(initialBalanceCents)) {
    throw new Error(
      `WALLET_INITIAL_BALANCE_CENTS must be integer cents, got "${initialBalanceCents}"`,
    );
  }
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    databaseUrl: requireEnv("DATABASE_URL"),
    rabbitMqUrl: requireEnv("RABBITMQ_URL"),
    keycloakJwksUrl: requireEnv("KEYCLOAK_JWKS_URL"),
    keycloakIssuer: requireEnv("KEYCLOAK_ISSUER"),
    initialBalanceCents,
  };
}
