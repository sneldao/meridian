/** Generate public/og-demo.png — the link preview for the send-a-link demo.
 *
 *  The preview is composed from the real demo journey: the same passport SVG
 *  the payoff beat stamps, over the stage's ink sky, with the stakes line as
 *  the hook. Re-run whenever the passport art or the demo story changes:
 *
 *    bun run scripts/make-og-demo.ts
 *
 *  Rendering happens in headless Chromium (Playwright), so what ships is
 *  exactly what browsers draw — no second SVG implementation to drift. */
import { chromium } from "@playwright/test";
import { demoJourney } from "../src/domain/demo-beats";
import { arrivalPassportSvg } from "../src/lib/arrival-passport-svg";
import path from "node:path";

const journey = demoJourney("jason");
const passport = journey.passport;
if (!passport) throw new Error("the demo journey must carry a stampable passport");
const passportSvg = arrivalPassportSvg(passport);

const html = `<!doctype html>
<html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(ellipse 62% 2px at 62% 84%, rgba(255, 214, 150, 0.55), transparent),
      radial-gradient(ellipse 120% 30% at 62% 84%, rgba(255, 196, 107, 0.26), transparent 72%),
      linear-gradient(180deg, #07090f 0%, #0c1220 50%, #131a2e 100%);
    color: #c9d2e4;
    display: flex; align-items: center; padding: 0 72px; gap: 56px;
  }
  .copy { flex: 1; }
  .kicker {
    font-size: 15px; font-weight: 800; letter-spacing: 0.22em;
    text-transform: uppercase; color: #e99a6f; margin-bottom: 22px;
  }
  h1 { font-size: 46px; line-height: 1.14; font-weight: 800; color: #f4f0e8; }
  h1 b { color: #ffc46b; font-variant-numeric: tabular-nums; }
  .sub { margin-top: 20px; font-size: 19px; line-height: 1.5; color: #8b93a7; }
  .word {
    margin-top: 34px; font-size: 15px; font-weight: 800;
    letter-spacing: 0.3em; color: #c9d2e4;
  }
  .passport { width: 330px; transform: rotate(-4deg); filter: drop-shadow(0 30px 50px rgba(0,0,0,0.5)); }
  .passport svg { width: 100%; height: auto; border-radius: 16px; }
</style></head>
<body>
  <div class="copy">
    <div class="kicker">The ninety-second example</div>
    <h1>Your meeting is at <b>16:00</b> Tokyo time.<br/>Your body thinks it&rsquo;s <b>07:00</b>.</h1>
    <div class="sub">Watch a crew of agents move it — and stamp what the first morning honestly owes.</div>
    <div class="word">MERIDIAN</div>
  </div>
  <div class="passport">${passportSvg}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.setContent(html, { waitUntil: "networkidle" });
const out = path.join(import.meta.dir, "..", "public", "og-demo.png");
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out} (2400×1260)`);
