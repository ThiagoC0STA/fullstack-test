import type { MultiplierHundredths } from "@crash/contracts";
import { hmacSha256Hex, sha256Hex } from "./hashing";

/**
 * Public salt mixed into every crash point derivation. Publishing it lets
 * players recompute results: the seed alone determines the outcome, and
 * the salt proves the operator did not switch derivation schemes.
 */
export const GAME_SALT = "jungle-crash-game-v1";

/** 1 in 33 rounds crash instantly at 1.00x (~3% house edge). */
export const INSTANT_CRASH_MODULUS = 33n;

/** Crash points are capped at 10,000.00x. */
export const MAX_CRASH_HUNDREDTHS = 1_000_000;

const FIFTY_TWO_BITS = 2n ** 52n;
const HEX_CHARS_FOR_52_BITS = 13;

export const CRASH_ALGORITHM_DESCRIPTION =
  `crashPoint = f(serverSeed): h = first 52 bits of ` +
  `HMAC_SHA256(key=serverSeed, message="${GAME_SALT}"); ` +
  `if h mod 33 == 0 the round crashes instantly at 1.00x; otherwise ` +
  `crashPointHundredths = floor((100 * 2^52 - h) / (2^52 - h)), capped at ` +
  `${MAX_CRASH_HUNDREDTHS}. Verify the seed itself with ` +
  `sha256(serverSeed) == seedHash (published before the round).`;

/**
 * Derives the crash point from a 52-bit hash value. Exposed separately
 * from the seed-based entry point so edge cases (instant crash, cap) are
 * directly testable. All arithmetic is BigInt: monetary precision rules
 * apply to the multiplier as well.
 */
export function crashPointFromHash(h: bigint): MultiplierHundredths {
  if (h < 0n || h >= FIFTY_TWO_BITS) {
    throw new RangeError(`Hash value out of 52-bit range: ${h}`);
  }
  if (h % INSTANT_CRASH_MODULUS === 0n) {
    return 100;
  }
  const hundredths = (100n * FIFTY_TWO_BITS - h) / (FIFTY_TWO_BITS - h);
  const capped = hundredths > BigInt(MAX_CRASH_HUNDREDTHS)
    ? BigInt(MAX_CRASH_HUNDREDTHS)
    : hundredths;
  return Number(capped);
}

export function calculateCrashPointHundredths(serverSeed: string): MultiplierHundredths {
  const digest = hmacSha256Hex(serverSeed, GAME_SALT);
  const h = BigInt(`0x${digest.slice(0, HEX_CHARS_FOR_52_BITS)}`);
  return crashPointFromHash(h);
}

export interface RoundVerificationInput {
  serverSeed: string;
  seedHash: string;
  crashPointHundredths: MultiplierHundredths;
}

export interface RoundVerificationResult {
  seedHashValid: boolean;
  crashPointValid: boolean;
  computedSeedHash: string;
  computedCrashPointHundredths: MultiplierHundredths;
}

/** Recomputes both commitments so a player can audit any past round. */
export function verifyRound(input: RoundVerificationInput): RoundVerificationResult {
  const computedSeedHash = sha256Hex(input.serverSeed);
  const computedCrashPointHundredths = calculateCrashPointHundredths(input.serverSeed);
  return {
    seedHashValid: computedSeedHash === input.seedHash,
    crashPointValid: computedCrashPointHundredths === input.crashPointHundredths,
    computedSeedHash,
    computedCrashPointHundredths,
  };
}
