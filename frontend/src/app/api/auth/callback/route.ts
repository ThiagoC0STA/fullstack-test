import { type NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";
import {
  AUTH_COOKIES,
  clearHandshakeCookies,
} from "@/server/auth/cookies";
import { exchangeCode } from "@/server/auth/oidc";
import { writeTokenCookies } from "@/server/auth/session";

export const runtime = "nodejs";

function redirectHome(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, authConfig.appUrl));
}

/**
 * Completes the OIDC handshake: validates state, exchanges the code for
 * tokens server-side, and drops them into httpOnly cookies. The browser
 * only ever sees a redirect back to the app.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get(AUTH_COOKIES.pkceVerifier)?.value;
  const expectedState = req.cookies.get(AUTH_COOKIES.state)?.value;

  if (!code || !state || !verifier || state !== expectedState) {
    const res = redirectHome("/?auth_error=state");
    clearHandshakeCookies(res);
    return res;
  }

  try {
    const tokens = await exchangeCode(code, verifier);
    const res = redirectHome("/");
    writeTokenCookies(res, tokens);
    clearHandshakeCookies(res);
    return res;
  } catch {
    const res = redirectHome("/?auth_error=exchange");
    clearHandshakeCookies(res);
    return res;
  }
}
