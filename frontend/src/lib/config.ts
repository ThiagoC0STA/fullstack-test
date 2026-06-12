/**
 * Public runtime configuration, inlined at build time by Next.
 *
 * Only the realtime socket talks to the gateway from the browser; REST and
 * auth now go through the same-origin BFF (`/api/*`), so no Keycloak URLs
 * are needed on the client anymore.
 */
export const appConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
} as const;
