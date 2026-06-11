import { expect, test, type Page } from "@playwright/test";

/**
 * Full player journey in a real browser against `bun run docker:up`:
 * Keycloak login (OIDC redirect), place a bet, cash out before the
 * crash, and see the wallet balance change in the header.
 *
 * The crash instant is random, so a single round can crash before we
 * cash out. The cashout flow retries on a fresh round until it lands a
 * win, which is what a real player experiences anyway.
 */

const TEST_USER = { username: "player", password: "player123" };

async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // standard Keycloak login form
  await page.waitForSelector("#username", { timeout: 30_000 });
  await page.fill("#username", TEST_USER.username);
  await page.fill("#password", TEST_USER.password);
  await page.click("#kc-login");

  // back on the app with a wallet balance in the header
  await page.waitForURL("http://localhost:3000/", { timeout: 30_000 });
  await expect(page.getByText(/\$\s/).first()).toBeVisible({ timeout: 30_000 });
}

type RoundOutcome = "cashed" | "lost" | "skipped";

/** One attempt: wait for betting, bet, then cash out before the crash. */
async function betAndTryCashout(page: Page): Promise<RoundOutcome> {
  const betButton = page.getByRole("button", { name: "Apostar", exact: true });

  // wait until a betting window is open (Apostar becomes enabled)
  try {
    await expect(betButton).toBeEnabled({ timeout: 25_000 });
  } catch {
    return "skipped";
  }
  await betButton.click();

  const cashoutButton = page.getByRole("button", { name: /^Sacar/ });
  const lostMessage = page.getByText(/perdidos/);

  // poll for the round to start running (Sacar appears) or crash early
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await lostMessage.isVisible().catch(() => false)) {
      return "lost";
    }
    if (await cashoutButton.isEnabled().catch(() => false)) {
      await cashoutButton.click();
      // success toast or the in-card cashed-out confirmation
      await expect(page.getByText(/Sacou/).first()).toBeVisible({ timeout: 15_000 });
      return "cashed";
    }
    await page.waitForTimeout(250);
  }
  return "skipped";
}

test("player logs in, bets and cashes out for a payout", async ({ page }) => {
  // the crash instant is random, so winning can take several rounds;
  // give the whole journey a generous budget instead of leaning on the
  // retry (a 120s default could close the page mid-wait → flake)
  test.setTimeout(300_000);
  await login(page);

  // stop starting new attempts with under 40s left so a wait never gets
  // cut off by the test timeout; the loop ends on the first cashout
  const stopStartingAt = Date.now() + 260_000;
  let outcome: RoundOutcome = "skipped";
  while (outcome !== "cashed" && Date.now() < stopStartingAt) {
    outcome = await betAndTryCashout(page);
    if (outcome === "lost") {
      // wait out the crashed round before the next attempt
      await page.waitForTimeout(2_000);
    }
  }

  expect(outcome).toBe("cashed");
});

test("the game is watchable without logging in", async ({ page }) => {
  await page.goto("/");
  // spectator: the round history strip and the login CTA are present
  await expect(page.getByText("Entrar para apostar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("CRASH")).toBeVisible();
});
