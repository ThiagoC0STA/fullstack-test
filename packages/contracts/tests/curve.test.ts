import { describe, expect, test } from "bun:test";
import {
  elapsedMsToReachMultiplier,
  multiplierAtElapsedMs,
} from "../src/curve";

describe("multiplierAtElapsedMs", () => {
  test("starts at exactly 1.00x", () => {
    expect(multiplierAtElapsedMs(0)).toBe(100);
  });

  test("never decreases over time", () => {
    let previous = 100;
    for (let t = 0; t <= 60_000; t += 250) {
      const current = multiplierAtElapsedMs(t);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  test("rejects negative elapsed time", () => {
    expect(() => multiplierAtElapsedMs(-1)).toThrow(RangeError);
  });
});

describe("elapsedMsToReachMultiplier", () => {
  test("1.00x is reached immediately", () => {
    expect(elapsedMsToReachMultiplier(100)).toBe(0);
  });

  test("returns the FIRST millisecond at which the curve reaches the target", () => {
    for (const target of [101, 150, 200, 254, 1000, 10_000, 1_000_000]) {
      const t = elapsedMsToReachMultiplier(target);
      expect(multiplierAtElapsedMs(t)).toBeGreaterThanOrEqual(target);
      if (t > 0) {
        expect(multiplierAtElapsedMs(t - 1)).toBeLessThan(target);
      }
    }
  });

  test("rejects multipliers below 1.00x", () => {
    expect(() => elapsedMsToReachMultiplier(99)).toThrow(RangeError);
  });
});
