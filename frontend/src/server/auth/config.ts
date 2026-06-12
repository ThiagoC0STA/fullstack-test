/**
 * Server-only auth configuration for the BFF.
 *
 * Two URL spaces exist on purpose:
 * - public  -> what the *browser* hits (front channel: authorize, logout).
 * - internal -> what the *Next server* hits (back channel: token, API).
 *
 * In Docker the internal URLs use service names (keycloak, kong); on a bare
 * `next dev` they fall back to localhost. The browser-facing values must
 * always be localhost so redirects land back on the user's machine.
 */
const env = process.env;

export const authConfig = {
  realm: env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "crash-game",
  clientId: env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "crash-game-client",
  appUrl: env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  keycloakPublicUrl: env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  keycloakInternalUrl:
    env.KEYCLOAK_INTERNAL_URL ?? env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  apiInternalUrl: env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  // Secure cookies require HTTPS; the local challenge runs on http://localhost,
  // so this defaults off and is flipped on for real deployments.
  cookieSecure: env.AUTH_COOKIE_SECURE === "true",
} as const;

export const REDIRECT_PATH = "/api/auth/callback";

function realmBase(host: string): string {
  return `${host}/realms/${authConfig.realm}/protocol/openid-connect`;
}

/** Browser-facing endpoints (front channel). */
export const publicEndpoints = {
  authorize: `${realmBase(authConfig.keycloakPublicUrl)}/auth`,
  logout: `${realmBase(authConfig.keycloakPublicUrl)}/logout`,
} as const;

/** Server-facing endpoints (back channel). */
export const internalEndpoints = {
  token: `${realmBase(authConfig.keycloakInternalUrl)}/token`,
} as const;

export const redirectUri = `${authConfig.appUrl}${REDIRECT_PATH}`;
