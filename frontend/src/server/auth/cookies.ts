import type { NextResponse } from "next/server";
import { authConfig } from "./config";

/**
 * httpOnly cookies are the whole point of the BFF: tokens live here, never
 * in JS-readable storage, so an XSS payload cannot exfiltrate them.
 */
export const AUTH_COOKIES = {
  accessToken: "cg_at",
  refreshToken: "cg_rt",
  idToken: "cg_it",
  pkceVerifier: "cg_pkce",
  state: "cg_state",
} as const;

type CookieValue = { name: string; value: string };

const BASE_OPTIONS = {
  httpOnly: true,
  // Lax keeps the cookie off cross-site POSTs (CSRF defense) while still
  // attaching it to the top-level GET redirect back from Keycloak.
  sameSite: "lax" as const,
  secure: authConfig.cookieSecure,
  path: "/",
};

/** Short-lived cookies that only bridge the authorize -> callback handshake. */
export function setHandshakeCookie(res: NextResponse, { name, value }: CookieValue): void {
  res.cookies.set(name, value, { ...BASE_OPTIONS, maxAge: 600 });
}

/** Session token cookies. maxAge tracks the token lifetime where known. */
export function setSessionCookie(
  res: NextResponse,
  { name, value }: CookieValue,
  maxAgeSeconds: number,
): void {
  res.cookies.set(name, value, { ...BASE_OPTIONS, maxAge: maxAgeSeconds });
}

export function clearCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", { ...BASE_OPTIONS, maxAge: 0 });
}

export function clearSessionCookies(res: NextResponse): void {
  clearCookie(res, AUTH_COOKIES.accessToken);
  clearCookie(res, AUTH_COOKIES.refreshToken);
  clearCookie(res, AUTH_COOKIES.idToken);
}

export function clearHandshakeCookies(res: NextResponse): void {
  clearCookie(res, AUTH_COOKIES.pkceVerifier);
  clearCookie(res, AUTH_COOKIES.state);
}
