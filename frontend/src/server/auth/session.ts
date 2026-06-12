import type { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIES, setSessionCookie } from "./cookies";
import { extractIdentity, isAccessTokenExpired, type Identity } from "./oidc-crypto";
import { refreshTokens, type TokenSet } from "./oidc";

export interface ResolvedToken {
  accessToken: string;
  identity: Identity | null;
  /** Applies refreshed token cookies to the outgoing response, if any. */
  applyRefresh?: (res: NextResponse) => void;
}

/**
 * Writes the token set onto a response. Refresh tokens are long-lived but
 * not eternal, so we cap their cookie at the broker-reported lifetime.
 */
export function writeTokenCookies(res: NextResponse, tokens: TokenSet): void {
  setSessionCookie(
    res,
    { name: AUTH_COOKIES.accessToken, value: tokens.access_token },
    tokens.expires_in ?? 300,
  );
  if (tokens.refresh_token) {
    setSessionCookie(
      res,
      { name: AUTH_COOKIES.refreshToken, value: tokens.refresh_token },
      tokens.refresh_expires_in ?? 1800,
    );
  }
  if (tokens.id_token) {
    setSessionCookie(
      res,
      { name: AUTH_COOKIES.idToken, value: tokens.id_token },
      tokens.refresh_expires_in ?? 1800,
    );
  }
}

/**
 * Resolves a usable access token from the request cookies, transparently
 * refreshing an expired one when a refresh token is present. Returns null
 * when the caller is effectively logged out.
 */
export async function resolveAccessToken(req: NextRequest): Promise<ResolvedToken | null> {
  const accessToken = req.cookies.get(AUTH_COOKIES.accessToken)?.value;
  if (accessToken && !isAccessTokenExpired(accessToken)) {
    return { accessToken, identity: extractIdentity(accessToken) };
  }

  const refreshToken = req.cookies.get(AUTH_COOKIES.refreshToken)?.value;
  if (!refreshToken) {
    return null;
  }

  try {
    const tokens = await refreshTokens(refreshToken);
    return {
      accessToken: tokens.access_token,
      identity: extractIdentity(tokens.access_token),
      applyRefresh: (res) => writeTokenCookies(res, tokens),
    };
  } catch {
    return null;
  }
}
