import { describe, expect, test } from "bun:test";
import {
  base64UrlEncode,
  decodeJwtPayload,
  deriveCodeChallenge,
  extractIdentity,
  generatePkce,
  isAccessTokenExpired,
  randomToken,
} from "../src/server/auth/oidc-crypto";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("base64UrlEncode", () => {
  test("emits URL-safe output with no padding", () => {
    const encoded = base64UrlEncode(new Uint8Array([251, 255, 191, 0, 16]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("deriveCodeChallenge", () => {
  // RFC 7636, Appendix B reference vector.
  test("matches the RFC 7636 reference vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await deriveCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("generatePkce derives a challenge from its own verifier", async () => {
    const { verifier, challenge } = await generatePkce();
    expect(challenge).toBe(await deriveCodeChallenge(verifier));
  });
});

describe("randomToken", () => {
  test("produces distinct URL-safe tokens", () => {
    const a = randomToken(16);
    const b = randomToken(16);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });
});

describe("decodeJwtPayload", () => {
  test("decodes the payload segment", () => {
    const token = makeJwt({ sub: "abc", preferred_username: "player" });
    expect(decodeJwtPayload(token)).toMatchObject({
      sub: "abc",
      preferred_username: "player",
    });
  });

  test("returns null for a non-JWT string", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });
});

describe("isAccessTokenExpired", () => {
  test("treats a token past its exp as expired", () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(isAccessTokenExpired(token)).toBe(true);
  });

  test("treats a comfortably future token as valid", () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isAccessTokenExpired(token)).toBe(false);
  });

  test("treats a token without exp as expired", () => {
    expect(isAccessTokenExpired(makeJwt({ sub: "abc" }))).toBe(true);
  });
});

describe("extractIdentity", () => {
  test("prefers preferred_username and exposes the subject", () => {
    const token = makeJwt({ sub: "player-1", preferred_username: "neo" });
    expect(extractIdentity(token)).toEqual({ playerId: "player-1", username: "neo" });
  });

  test("falls back to the subject when no username claim is present", () => {
    const token = makeJwt({ sub: "player-1" });
    expect(extractIdentity(token)).toEqual({ playerId: "player-1", username: "player-1" });
  });

  test("returns null when the subject is missing", () => {
    expect(extractIdentity(makeJwt({ preferred_username: "neo" }))).toBeNull();
  });
});
