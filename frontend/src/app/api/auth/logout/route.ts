import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIES, clearSessionCookies } from "@/server/auth/cookies";
import { buildLogoutUrl } from "@/server/auth/oidc";

export const runtime = "nodejs";

/**
 * Ends the local session (drops the token cookies) and bounces through
 * Keycloak's end-session endpoint so the IdP session is killed too.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const idToken = req.cookies.get(AUTH_COOKIES.idToken)?.value;
  const res = NextResponse.redirect(buildLogoutUrl(idToken));
  clearSessionCookies(res);
  return res;
}
