import { test, expect } from "@playwright/test";

/** Visual regression on the load-bearing surfaces (round 17).
 *
 *  Determinism: the clock is frozen before every page, storage is seeded in
 *  an init script, and CSS animations are disabled at capture time. The
 *  baselines live next to this file and are regenerated on the CI runner
 *  via the `update_baselines` workflow dispatch — never locally, since
 *  rendering must match the machine that compares. */

const FIXED_NOW = new Date("2026-11-01T09:30:00Z");
const TRIP = { origin: "LHR", dest: "SIN", date: "2026-11-04" };

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

test("entry — the first screen asks for a route", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForSelector('input[aria-label="Departure date"]', { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("entry.png");
});

test("home — the journey view under its own sky", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.clear();
    localStorage.setItem("meridian:activeTrip", JSON.stringify(trip));
  }, TRIP);
  await page.goto("/");
  await page.waitForSelector(".hero", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("home.png");
});

test("more — the sheet grows out of its tab", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.clear();
    localStorage.setItem("meridian:activeTrip", JSON.stringify(trip));
  }, TRIP);
  await page.goto("/");
  await page.waitForSelector(".hero", { timeout: 30000 });
  await page.locator(".bottom-nav button", { hasText: "More" }).click();
  await page.waitForSelector(".more-sheet", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("more-sheet.png");
});

test("demo — the stakes beat", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/demo");
  await page.waitForSelector('[data-beat="stakes"]', { timeout: 30000 });
  await expect(page).toHaveScreenshot("demo-stakes.png");
});

test("demo — the payoff beat stamps the passport", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/demo");
  await page.waitForSelector('[data-beat="stakes"]', { timeout: 30000 });
  for (let i = 0; i < 3; i++) {
    await page.locator(".demo-foot .demo-nav", { hasText: "Next" }).click();
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('[data-beat="payoff"]', { timeout: 10000 });
  await expect(page).toHaveScreenshot("demo-payoff.png");
});

// The payoff's gift row (share + portrait) sits below the 844px fold, so the
// capture above never saw it — a second, scrolled shot guards the buttons.
test("demo — the payoff's gift buttons", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/demo");
  await page.waitForSelector('[data-beat="stakes"]', { timeout: 30000 });
  for (let i = 0; i < 3; i++) {
    await page.locator(".demo-foot .demo-nav", { hasText: "Next" }).click();
    await page.waitForTimeout(250);
  }
  await page.waitForSelector(".demo-ctas", { timeout: 10000 });
  await page.locator(".demo-ctas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("demo-payoff-ctas.png");
});

test("stage — today opens on the full-bleed stage", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.clear();
    localStorage.setItem("meridian:activeTrip", JSON.stringify(trip));
  }, TRIP);
  await page.goto("/");
  await page.waitForSelector(".today-stage", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("today-stage.png");
});

test("stage — the hand-off as the pin releases", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.clear();
    localStorage.setItem("meridian:activeTrip", JSON.stringify(trip));
  }, TRIP);
  await page.goto("/");
  await page.waitForSelector(".today-stage", { timeout: 30000 });
  await page.evaluate(() => window.scrollTo({ top: Math.round(innerHeight * 1.6) }));
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("today-stage-handoff.png");
});

test("trips — the deck", async ({ page }) => {
  await page.addInitScript((trip) => {
    localStorage.clear();
    localStorage.setItem("meridian:activeTrip", JSON.stringify(trip));
    const mk = (savedAt: string, origin: string, dest: string) =>
      JSON.stringify({
        id: null,
        savedAt,
        fallback: false,
        score: 92,
        trip: {
          origin: { code: origin, name: origin },
          destination: { code: dest, name: dest },
          requiredShiftMin: 420,
          direction: "east",
          departureDayIndex: 0,
          days: [{ dayIndex: 0, label: "D1", date: "2026-10-30", shiftMin: 60 }],
        },
        days: [{ label: "D1", shiftMin: 60 }],
      });
    localStorage.setItem(
      "meridian:history",
      `[${mk("2026-10-30T08:00:00.000Z", "LHR", "SIN")},${mk("2026-10-28T08:00:00.000Z", "SFO", "NRT")}]`,
    );
  }, TRIP);
  await page.goto("/history");
  await page.waitForSelector(".trip-deck-card", { timeout: 30000 });
  await expect(page).toHaveScreenshot("trips-deck.png");
});
