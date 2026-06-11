import { describe, expect, test } from "bun:test";
import { computeCrashPoint, verifyRoundInBrowser } from "../src/lib/verify";

/**
 * Frozen snapshots shared with the backend test suite: the browser
 * verification must agree with the server algorithm bit for bit.
 */
describe("computeCrashPoint (WebCrypto)", () => {
  test("matches the backend snapshot values", async () => {
    expect(await computeCrashPoint("seed-a")).toBe(265);
    expect(await computeCrashPoint("seed-b")).toBe(802);
    expect(await computeCrashPoint("deadbeef")).toBe(236);
  });

  test("detects instant crashes", async () => {
    expect(await computeCrashPoint("instant-87")).toBe(100);
  });
});

describe("verifyRoundInBrowser", () => {
  test("accepts an honest round", async () => {
    const result = await verifyRoundInBrowser({
      serverSeed: "seed-a",
      seedHash: "e00961cc04e55c4533144d93fda113d960b6ad37e54a86a41bbba4f031e29d92",
      crashPointHundredths: 265,
    });
    expect(result.seedHashValid).toBe(true);
    expect(result.crashPointValid).toBe(true);
  });

  test("flags tampered data", async () => {
    const result = await verifyRoundInBrowser({
      serverSeed: "seed-a",
      seedHash: "e00961cc04e55c4533144d93fda113d960b6ad37e54a86a41bbba4f031e29d92",
      crashPointHundredths: 300,
    });
    expect(result.crashPointValid).toBe(false);
  });
});
