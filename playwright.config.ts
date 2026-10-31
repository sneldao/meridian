import { defineConfig } from "@playwright/test";

/** Visual regression (round 17). Screenshots are platform-specific, so they
 *  are generated and compared on the same machine — the CI runner — via the
 *  `update_baselines` workflow_dispatch input. Time is frozen per test so
 *  clocks and countdowns never race the shutter. The suite lives in visual/,
 *  outside tests/, so `bun test` never loads the Playwright API. */
export default defineConfig({
  testDir: "./visual",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3110",
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  webServer: {
    // node_modules/.bin rather than bunx so the spawned shell needs no bun
    // on PATH (works identically in CI after bun install).
    command: "./node_modules/.bin/next start -p 3110",
    url: "http://127.0.0.1:3110",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { AGENT_PROVIDER: "replay" },
  },
});
