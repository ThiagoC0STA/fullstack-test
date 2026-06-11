import type { MultiplierHundredths } from "@crash/contracts";

/**
 * Independent provably fair verification, recomputed IN THE BROWSER
 * with WebCrypto. Mirrors the documented algorithm exposed by
 * GET /games/rounds/:roundId/verify so players do not have to trust
 * the server, or even this code: the salt and formula are public.
 */
export const GAME_SALT = "jungle-crash-game-v1";

const MAX_CRASH_HUNDREDTHS = 1_000_000n;
const FIFTY_TWO_BITS = 2n ** 52n;
const encoder = new TextEncoder();

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  return bufferToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bufferToHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

export async function computeCrashPoint(serverSeed: string): Promise<MultiplierHundredths> {
  const digest = await hmacSha256Hex(serverSeed, GAME_SALT);
  const h = BigInt(`0x${digest.slice(0, 13)}`);
  if (h % 33n === 0n) {
    return 100;
  }
  const hundredths = (100n * FIFTY_TWO_BITS - h) / (FIFTY_TWO_BITS - h);
  return Number(hundredths > MAX_CRASH_HUNDREDTHS ? MAX_CRASH_HUNDREDTHS : hundredths);
}

export interface BrowserVerificationResult {
  seedHashValid: boolean;
  crashPointValid: boolean;
  computedSeedHash: string;
  computedCrashPointHundredths: MultiplierHundredths;
}

export async function verifyRoundInBrowser(input: {
  serverSeed: string;
  seedHash: string;
  crashPointHundredths: MultiplierHundredths;
}): Promise<BrowserVerificationResult> {
  const computedSeedHash = await sha256Hex(input.serverSeed);
  const computedCrashPointHundredths = await computeCrashPoint(input.serverSeed);
  return {
    seedHashValid: computedSeedHash === input.seedHash,
    crashPointValid: computedCrashPointHundredths === input.crashPointHundredths,
    computedSeedHash,
    computedCrashPointHundredths,
  };
}
