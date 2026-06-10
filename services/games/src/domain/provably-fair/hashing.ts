import { createHash, createHmac, randomBytes } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

export function randomSecretHex(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generates the provably fair seed chain: chain[0] = sha256(secret),
 * chain[i] = sha256(chain[i - 1]).
 *
 * Rounds consume the chain from the END toward the start, so the seed
 * revealed for round N+1 hashes to the seed of round N. Once a seed is
 * revealed, every earlier seed is pinned by the chain and the house
 * cannot regenerate future results.
 */
export function generateSeedChain(secret: string, length: number): string[] {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError(`Chain length must be a positive integer, got ${length}`);
  }
  const chain: string[] = [sha256Hex(secret)];
  for (let i = 1; i < length; i++) {
    chain.push(sha256Hex(chain[i - 1] as string));
  }
  return chain;
}
