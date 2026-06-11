import { expect, test } from "@playwright/test";

const greenPixels = () => {
  const c = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!c) return 0;
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let green = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (g > 150 && r < 130 && g > r + 40 && g > b + 20) green++;
  }
  return green;
};

test("capture the very first frames of a round", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // wait for a non-running phase first (betting/cooldown), so the next
  // green burst is a genuine round start, not a mid-round connect
  const deadline = Date.now() + 150_000;
  const waitFor = async (pred: (g: number) => boolean) => {
    while (Date.now() < deadline) {
      if (pred(await page.evaluate(greenPixels))) return true;
      await page.waitForTimeout(80);
    }
    return false;
  };

  await waitFor((g) => g < 1500);
  await waitFor((g) => g > 2500);

  for (let i = 0; i < 6; i++) {
    await canvas.screenshot({ path: `test-results/begin-${i}.png` });
    await page.waitForTimeout(90);
  }
});
