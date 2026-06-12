import { type NextRequest, NextResponse } from "next/server";
import { resolveAccessToken } from "@/server/auth/session";

export const runtime = "nodejs";

interface SessionBody {
  authenticated: boolean;
  playerId?: string;
  username?: string;
}

/**
 * The browser's only window into who it is: identity is derived server-side
 * from the httpOnly token cookie, so the access token itself never crosses
 * to client JS.
 */
export async function GET(req: NextRequest): Promise<NextResponse<SessionBody>> {
  const resolved = await resolveAccessToken(req);
  if (!resolved?.identity) {
    return NextResponse.json({ authenticated: false });
  }

  const res = NextResponse.json<SessionBody>({
    authenticated: true,
    playerId: resolved.identity.playerId,
    username: resolved.identity.username,
  });
  resolved.applyRefresh?.(res);
  return res;
}
