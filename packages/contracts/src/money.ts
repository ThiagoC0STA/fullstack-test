/**
 * Monetary values cross every service and JSON boundary as integer cents
 * encoded in strings ("1050" = 10.50). JSON numbers are IEEE-754 doubles,
 * so keeping cents inside strings guarantees money never passes through
 * floating point. All arithmetic happens in BigInt.
 */
export type CentsString = string;

/** Multipliers travel as integer hundredths: 100 = 1.00x, 254 = 2.54x. */
export type MultiplierHundredths = number;

export const MULTIPLIER_BASE = 100;

export const BET_LIMITS = {
  MIN_CENTS: "100" as CentsString,
  MAX_CENTS: "100000" as CentsString,
} as const;

const CENTS_PATTERN = /^(0|[1-9][0-9]*)$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

export function isCents(value: string): value is CentsString {
  return CENTS_PATTERN.test(value);
}

export function assertCents(value: string): asserts value is CentsString {
  if (!isCents(value)) {
    throw new InvalidMoneyError(
      `Expected a non-negative integer cents string, got "${value}"`,
    );
  }
}

export function assertMultiplier(value: number): asserts value is MultiplierHundredths {
  if (!Number.isSafeInteger(value) || value < MULTIPLIER_BASE) {
    throw new InvalidMoneyError(
      `Expected an integer multiplier >= ${MULTIPLIER_BASE} hundredths, got ${value}`,
    );
  }
}

/** Parses a decimal string like "10", "10.5" or "10.50" into cents ("1050"). */
export function decimalToCents(decimal: string): CentsString {
  if (!DECIMAL_PATTERN.test(decimal)) {
    throw new InvalidMoneyError(
      `Expected a decimal amount with up to 2 fraction digits, got "${decimal}"`,
    );
  }
  const [units, fraction = ""] = decimal.split(".");
  const paddedFraction = fraction.padEnd(2, "0");
  return (BigInt(units as string) * 100n + BigInt(paddedFraction)).toString();
}

/** Formats cents ("1050") as a plain decimal string ("10.50"). */
export function centsToDecimal(cents: CentsString): string {
  assertCents(cents);
  const value = BigInt(cents);
  const units = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${units}.${fraction}`;
}

export function addCents(a: CentsString, b: CentsString): CentsString {
  assertCents(a);
  assertCents(b);
  return (BigInt(a) + BigInt(b)).toString();
}

export function subtractCents(a: CentsString, b: CentsString): CentsString {
  assertCents(a);
  assertCents(b);
  const result = BigInt(a) - BigInt(b);
  if (result < 0n) {
    throw new InvalidMoneyError(
      `Subtraction would produce a negative amount: ${a} - ${b}`,
    );
  }
  return result.toString();
}

export function compareCents(a: CentsString, b: CentsString): -1 | 0 | 1 {
  assertCents(a);
  assertCents(b);
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Payout = bet x multiplier, floored to the cent.
 * The division by MULTIPLIER_BASE happens in BigInt, so the result
 * never touches floating point.
 */
export function calculatePayoutCents(
  betCents: CentsString,
  multiplier: MultiplierHundredths,
): CentsString {
  assertCents(betCents);
  assertMultiplier(multiplier);
  return ((BigInt(betCents) * BigInt(multiplier)) / BigInt(MULTIPLIER_BASE)).toString();
}

/** Formats a multiplier in hundredths (254) as its display value ("2.54"). */
export function multiplierToDecimal(multiplier: MultiplierHundredths): string {
  assertMultiplier(multiplier);
  const units = Math.floor(multiplier / MULTIPLIER_BASE);
  const fraction = (multiplier % MULTIPLIER_BASE).toString().padStart(2, "0");
  return `${units}.${fraction}`;
}
