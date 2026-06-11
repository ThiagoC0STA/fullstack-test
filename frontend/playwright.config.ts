import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E against the running stack (`bun run docker:up`).
 * Playwright drives a real Chromium through the full player journey:
 * Keycloak login, place a bet, cash out. No webServer block — the app
 * is served by the frontend container on :3000.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
