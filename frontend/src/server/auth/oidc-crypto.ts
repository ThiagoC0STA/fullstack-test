/**
 * Pure OIDC/PKCE primitives, isolated from any network or Next APIs so they
 * can be unit-tested directly. RFC 7636: the verifier is a high-entropy
 * random string and the challenge is BASE64URL(SHA256(ASCII(verifier))).
 */

export function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

export async function generatePkce(): Promise<Pkce> {
  const verifier = randomToken(32);
  const challenge = await deriveCodeChallenge(verifier);
  return { verifier, challenge };
}

export interface JwtPayload {
  sub?: string;
  preferred_username?: string;
  exp?: number;
  [claim: string]: unknown;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(segments[1] as string, "base64url").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Treat the token as expired a few seconds early so we refresh before a
 * request can race past the real expiry.
 */
export function isAccessTokenExpired(token: string, skewSeconds = 15): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return true;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - skewSeconds <= nowSeconds;
}

export interface Identity {
  playerId: string;
  username: string;
}

export function extractIdentity(token: string): Identity | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.sub !== "string") {
    return null;
  }
  const username =
    typeof payload.preferred_username === "string"
      ? payload.preferred_username
      : payload.sub;
  return { playerId: payload.sub, username };
}
