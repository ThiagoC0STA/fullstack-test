import { describe, expect, test } from "bun:test";
import {
  calculateCrashPointHundredths,
  crashPointFromHash,
  MAX_CRASH_HUNDREDTHS,
  verifyRound,
} from "../../src/domain/provably-fair/crash-point";
import {
  generateSeedChain,
  sha256Hex,
} from "../../src/domain/provably-fair/hashing";

describe("sha256Hex", () => {
  test("matches the NIST test vector for 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("generateSeedChain", () => {
  test("each element is the sha256 of the previous one", () => {
    const chain = generateSeedChain("secret", 5);
    expect(chain).toHaveLength(5);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i]).toBe(sha256Hex(chain[i - 1] as string));
    }
  });

  test("is deterministic for the same secret", () => {
    expect(generateSeedChain("secret", 3)).toEqual(generateSeedChain("secret", 3));
  });

  test("reverse consumption links every revealed seed to the previous round", () => {
    // Round k uses chain[N-k]; the seed revealed for round k+1 must hash
    // to the seed of round k, pinning the whole history.
    const chain = generateSeedChain("secret", 5);
    const roundSeeds = [...chain].reverse();
    for (let k = 0; k + 1 < roundSeeds.length; k++) {
      expect(sha256Hex(roundSeeds[k + 1] as string)).toBe(roundSeeds[k] as string);
    }
  });

  test("rejects non-positive lengths", () => {
    expect(() => generateSeedChain("secret", 0)).toThrow(RangeError);
    expect(() => generateSeedChain("secret", -1)).toThrow(RangeError);
  });
});

describe("crashPointFromHash", () => {
  test("crashes instantly when h is divisible by 33", () => {
    expect(crashPointFromHash(0n)).toBe(100);
    expect(crashPointFromHash(33n)).toBe(100);
    expect(crashPointFromHash(66n)).toBe(100);
  });

  test("returns 1.00x for the smallest non-instant hashes", () => {
    expect(crashPointFromHash(1n)).toBe(100);
  });

  test("caps the crash point at the maximum", () => {
    // 2^52 - 1 is not divisible by 33 and yields an astronomical raw value
    expect(crashPointFromHash(2n ** 52n - 1n)).toBe(MAX_CRASH_HUNDREDTHS);
  });

  test("rejects hashes outside the 52-bit range", () => {
    expect(() => crashPointFromHash(-1n)).toThrow(RangeError);
    expect(() => crashPointFromHash(2n ** 52n)).toThrow(RangeError);
  });
});

describe("calculateCrashPointHundredths", () => {
  test("matches frozen snapshot values (algorithm must never drift)", () => {
    expect(calculateCrashPointHundredths("seed-a")).toBe(265);
    expect(calculateCrashPointHundredths("seed-b")).toBe(802);
    expect(calculateCrashPointHundredths("deadbeef")).toBe(236);
  });

  test("produces an instant crash for a known unlucky seed", () => {
    expect(calculateCrashPointHundredths("instant-87")).toBe(100);
  });

  test("is deterministic", () => {
    expect(calculateCrashPointHundredths("any-seed")).toBe(
      calculateCrashPointHundredths("any-seed"),
    );
  });

  test("always stays within [1.00x, cap] across many seeds", () => {
    for (let i = 0; i < 500; i++) {
      const crashPoint = calculateCrashPointHundredths(`property-seed-${i}`);
      expect(crashPoint).toBeGreaterThanOrEqual(100);
      expect(crashPoint).toBeLessThanOrEqual(MAX_CRASH_HUNDREDTHS);
    }
  });
});

describe("verifyRound", () => {
  const serverSeed = "seed-a";
  const seedHash = sha256Hex(serverSeed);
  const crashPointHundredths = calculateCrashPointHundredths(serverSeed);

  test("accepts an honest round", () => {
    const result = verifyRound({ serverSeed, seedHash, crashPointHundredths });
    expect(result.seedHashValid).toBe(true);
    expect(result.crashPointValid).toBe(true);
    expect(result.computedSeedHash).toBe(seedHash);
    expect(result.computedCrashPointHundredths).toBe(crashPointHundredths);
  });

  test("flags a seed that does not match the published hash", () => {
    const result = verifyRound({
      serverSeed: "tampered-seed",
      seedHash,
      crashPointHundredths,
    });
    expect(result.seedHashValid).toBe(false);
  });

  test("flags a crash point that does not match the seed", () => {
    const result = verifyRound({
      serverSeed,
      seedHash,
      crashPointHundredths: crashPointHundredths + 1,
    });
    expect(result.crashPointValid).toBe(false);
  });
});
