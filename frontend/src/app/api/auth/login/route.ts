import { NextResponse } from "next/server";
import { AUTH_COOKIES, setHandshakeCookie } from "@/server/auth/cookies";
import { generatePkce, randomToken } from "@/server/auth/oidc-crypto";
import { buildAuthorizeUrl } from "@/server/auth/oidc";

export const runtime = "nodejs";

/**
 * Starts the OIDC authorization-code + PKCE flow. The verifier and state
 * are stashed in httpOnly cookies so the browser never holds them, then we
 * redirect to Keycloak.
 */
export async function GET(): Promise<NextResponse> {
  const { verifier, challenge } = await generatePkce();
  const state = randomToken(16);

  const res = NextResponse.redirect(buildAuthorizeUrl({ state, challenge }));
  setHandshakeCookie(res, { name: AUTH_COOKIES.pkceVerifier, value: verifier });
  setHandshakeCookie(res, { name: AUTH_COOKIES.state, value: state });
  return res;
}
