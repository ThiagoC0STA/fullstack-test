import { MULTIPLIER_BASE, type MultiplierHundredths } from "./money";

/**
 * Multiplier curve: m(t) = floor(100 * e^(GROWTH_RATE_PER_MS * t)).
 * Doubles roughly every 11.5 seconds.
 *
 * The multiplier is NOT money: the float exponential is floored into
 * integer hundredths at a single, deterministic point, and every
 * monetary calculation downstream (payout) is pure BigInt on those
 * hundredths.
 */
export const GROWTH_RATE_PER_MS = 0.00006;

export function multiplierAtElapsedMs(elapsedMs: number): MultiplierHundredths {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`Elapsed time must be non-negative, got ${elapsedMs}`);
  }
  const raw = Math.floor(MULTIPLIER_BASE * Math.exp(GROWTH_RATE_PER_MS * elapsedMs));
  return Math.max(MULTIPLIER_BASE, raw);
}

/**
 * Inverse of the curve: first elapsed millisecond at which the
 * multiplier reaches `multiplier`. Used to schedule the crash instant
 * from the predetermined crash point.
 */
export function elapsedMsToReachMultiplier(multiplier: MultiplierHundredths): number {
  if (!Number.isSafeInteger(multiplier) || multiplier < MULTIPLIER_BASE) {
    throw new RangeError(`Multiplier must be >= ${MULTIPLIER_BASE}, got ${multiplier}`);
  }
  if (multiplier === MULTIPLIER_BASE) {
    return 0;
  }
  const exact = Math.log(multiplier / MULTIPLIER_BASE) / GROWTH_RATE_PER_MS;
  // floor() in the forward direction means the curve can lag the exact
  // solution by up to one unit; walk forward to the true first instant.
  let candidate = Math.max(0, Math.floor(exact) - 1);
  while (multiplierAtElapsedMs(candidate) < multiplier) {
    candidate += 1;
  }
  return candidate;
}
