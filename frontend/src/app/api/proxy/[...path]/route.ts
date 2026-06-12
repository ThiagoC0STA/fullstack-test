import { type NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";
import { resolveAccessToken } from "@/server/auth/session";

export const runtime = "nodejs";

// Only the public service surfaces are reachable through the BFF, so the
// proxy can never be turned into an open relay inside the Docker network.
const ALLOWED_PREFIXES = ["games", "wallets"];

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function forward(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { path } = await ctx.params;
  if (path.length === 0 || !ALLOWED_PREFIXES.includes(path[0] as string)) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const target = `${authConfig.apiInternalUrl}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const resolved = await resolveAccessToken(req);
  if (resolved) {
    headers.set("authorization", `Bearer ${resolved.accessToken}`);
  }

  // Empty POSTs (e.g. cashout, open wallet) forward as no body, matching the
  // previous direct fetch and keeping upstream body parsing happy.
  const rawBody = req.method === "GET" ? "" : await req.text();
  const body = rawBody.length > 0 ? rawBody : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Sem conexão com o servidor" },
      { status: 502 },
    );
  }

  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
  resolved?.applyRefresh?.(res);
  return res;
}

export const GET = forward;
export const POST = forward;
