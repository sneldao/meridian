import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// design.md is a contract with MUSTs in it. This is the executable half of it:
// either a rule today's code satisfies, or a measured debt frozen at today's
// value so it can only shrink. Raising a ceiling is a design decision, not a
// merge artifact — that is the point of keeping it in code review's face.

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selector: string; body: string };

/** Every rule in the stylesheet, with media queries descended into. */
function rules(src: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const selector = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth > 0) j++;
    }
    const body = src.slice(open + 1, j);
    if (selector.startsWith("@")) out.push(...rules(body));
    else if (selector) out.push({ selector: selector.replace(/\s+/g, " "), body });
    i = j + 1;
  }
  return out;
}

const ALL = rules(css);

/** Merged body of every rule with this selector — `:root` is declared often. */
const bodyOf = (selector: string) =>
  ALL.filter((r) => r.selector === selector)
    .map((r) => r.body)
    .join("\n");

const decl = (body: string, prop: string) =>
  body.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1]?.trim() ?? "";

const THEMES = [":root", 'html[data-theme="night"]', ".hero, .clock-stage"];

/** Files that paint DOM chrome — colour and spacing must come from tokens. */
const CHROME = [
  "src/app/page.tsx",
  ...[
    "NudgeFeedScreen", "RoutePicker", "HeroDawnPanel", "DayScene", "DeepDiveVisuals",
    "TripSetupScreen", "CalendarApprovalCard", "UndoToast", "VoiceControls", "ArrivalDayView",
    "DaySkyStrip", "CrewFeed", "DailyJourney", "DawnScrubber", "DayCardShare",
    "ScenarioExperience", "TasteItineraryCard", "LightWindowPanel", "PerformanceBrief",
  ].map((n) => `src/components/${n}.tsx`),
  "src/components/ui/AgentCard.tsx",
  "src/components/ui/AgentChip.tsx",
  "src/components/dial/BodyClockDetails.tsx",
  "src/components/dial/DisclosureSheet.tsx",
  "src/components/dial/MeridianOnboarding.tsx",
  "src/components/dial/ShiftScreen.tsx",
];

const bare = (p: string) => p.split("/").pop()!;

// Baseline 31 Oct 2026. Lower a number when debt goes; never raise it.
// A chrome file absent from these maps has a ceiling of zero.
const HEX_CEILING: Record<string, number> = {
  "src/components/NudgeFeedScreen.tsx": 18,
  "src/components/RoutePicker.tsx": 10,
  "src/components/DeepDiveVisuals.tsx": 8,
  "src/components/HeroDawnPanel.tsx": 7,
  "src/components/DayScene.tsx": 5,
  "src/components/TripSetupScreen.tsx": 3,
  "src/components/UndoToast.tsx": 3,
  "src/components/VoiceControls.tsx": 2,
  "src/components/CalendarApprovalCard.tsx": 1,
  "src/app/page.tsx": 8,
};

const STYLE_CEILING: Record<string, number> = {
  "src/components/NudgeFeedScreen.tsx": 72,
  "src/app/page.tsx": 44,
  "src/components/TripSetupScreen.tsx": 18,
  "src/components/CalendarApprovalCard.tsx": 11,
  "src/components/DaySkyStrip.tsx": 4,
  "src/components/dial/ShiftScreen.tsx": 3,
  "src/components/CrewFeed.tsx": 3,
  "src/components/dial/DisclosureSheet.tsx": 2,
  "src/components/UndoToast.tsx": 2,
  "src/components/DayScene.tsx": 2,
  "src/components/HeroDawnPanel.tsx": 1,
  "src/components/DeepDiveVisuals.tsx": 1,
  "src/components/DayCardShare.tsx": 1,
  "src/components/DawnScrubber.tsx": 1,
  "src/components/DailyJourney.tsx": 1,
  "src/components/ui/AgentCard.tsx": 1,
  "src/components/ui/AgentChip.tsx": 1,
  "src/components/dial/BodyClockDetails.tsx": 1,
  "src/components/dial/MeridianOnboarding.tsx": 1,
};

const LAYOUT_ANIMATOR = /\b(width|height|max-height|min-height|margin|padding|inset|top|left|right|bottom)\b/;

// design.md:117 — "Only transform and opacity animate." Paint-only crossfades
// (color, background, shadow) stay; these animate boxes and reflow. Frozen
// debt, counted by exact declaration text, in css then tsx.
const MOTION_DEBT: Record<string, number> = {
  "transition: width var(--dur-settle) var(--ease-settle);": 3,
  "transition: max-height var(--dur-settle) var(--ease-settle), opacity var(--dur-glide) var(--ease-glide), padding var(--dur-settle) var(--ease-settle);": 1,
  "width 0.3s ease-out": 1,
};

// design.md — the surfaces allowed to break the reading column, in the order
// they appear on the page. Adding one is a contract change, so it is a list.
const INSTRUMENT_BANDS = [
  "marks-waiting banner",
  "day stepper",
  "check-in card",
  "calendar summary",
  "the rail card",
];

describe("design contract", () => {
  test("every step kind keeps one hue in every palette", () => {
    const union = read("src/domain/nudges.ts").match(/export type NudgeCategory =([^;]+);/)![1];
    const cats = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(cats.length).toBe(6);

    for (const cat of cats) {
      const rule = ALL.find((r) => r.selector === `[data-cat="${cat}"]`);
      expect(rule ? rule.selector : `missing [data-cat="${cat}"]`).toBeTruthy();
      const varName = decl(rule!.body, "--cat").replace(/var\(|\)/g, "");
      expect(varName.startsWith("--cat-")).toBe(true);
      for (const theme of THEMES) {
        expect(decl(bodyOf(theme), varName), `${varName} missing from ${theme}`).not.toBe("");
      }
    }
  });

  test("no theme lets an uncategorised step claim a data colour", () => {
    const fallback = decl(bodyOf(".tl-row"), "--cat").replace(/var\(|\)/g, "");
    expect(fallback.startsWith("--")).toBe(true);

    // Resolved per palette: the collision was palette-specific. The stage
    // block set --m-accent equal to --cat-food, so a step with no kind
    // rendered as food there while cream and night read correctly.
    for (const theme of THEMES) {
      const body = bodyOf(theme);
      const hues = [...body.matchAll(/--cat-[a-z]+:\s*(#[0-9a-fA-F]{6})/g)]
        .map((m) => m[1].toLowerCase());
      expect(hues.length).toBe(6);
      const resolved = body
        .match(new RegExp(`${fallback}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
        ?.toLowerCase();
      expect(resolved, `${fallback} is not a colour token in ${theme}`).toBeTruthy();
      expect(hues.includes(resolved!), `${fallback} resolves to a --cat-* hue in ${theme}`).toBe(false);
    }
    expect(decl(bodyOf(".tl-glyph"), "color")).toContain(fallback);
  });

  test("every .wide surface is on the sanctioned list", () => {
    const sites: string[] = [];
    for (const file of CHROME) {
      for (const line of read(file).split("\n")) {
        if (/className=.*\bwide\b/.test(line)) sites.push(bare(file));
      }
    }
    expect(new Set(sites).size).toBe(1);
    expect(sites.length).toBe(INSTRUMENT_BANDS.length);
  });

  test("the sanctioned surfaces are written down", () => {
    const doc = read("design.md").toLowerCase();
    for (const name of INSTRUMENT_BANDS) {
      expect(doc).toContain(name.toLowerCase());
    }
    expect(decl(bodyOf(".wide"), "margin-left")).toContain("--hero-out");
  });

  test("only transform, opacity and paint animate", () => {
    const offenders: string[] = [];
    for (const r of ALL) {
      for (const m of r.body.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) {
        if (LAYOUT_ANIMATOR.test(m[1])) offenders.push(`transition: ${m[1].trim()};`);
      }
    }
    for (const line of read("src/components/NudgeFeedScreen.tsx").split("\n")) {
      const m = line.match(/transition: "([^"]+)"/);
      if (m && LAYOUT_ANIMATOR.test(m[1])) offenders.push(m[1]);
    }

    for (const [text, count] of Object.entries(MOTION_DEBT)) {
      const seen = offenders.filter((o) => o === text).length;
      expect(seen, `more "${text}" than the ${count} on file`).toBeLessThanOrEqual(count);
    }
    for (const o of new Set(offenders)) {
      expect(Object.keys(MOTION_DEBT), `new layout animation: ${o}`).toContain(o);
    }
  });

  test("chrome reaches for tokens, not literals", () => {
    for (const file of CHROME) {
      const src = read(file);
      const hex = (src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length;
      expect(hex, `${bare(file)}: ${hex} hex literals, ceiling ${HEX_CEILING[file] ?? 0}`).toBeLessThanOrEqual(
        HEX_CEILING[file] ?? 0,
      );
      const inline = (src.match(/style=\{\{/g) ?? []).length;
      expect(inline, `${bare(file)}: ${inline} inline styles, ceiling ${STYLE_CEILING[file] ?? 0}`).toBeLessThanOrEqual(
        STYLE_CEILING[file] ?? 0,
      );
    }
  });

  test("a state is hedged once, not once per sentence", () => {
    // design.md "Copy voice". Scanner scope: quoted copy in DOM chrome, so a
    // second hedge phrase on a surface that already names its state is a new
    // decision, and every phrase retired must be retired from the allowlist.
    const HEDGES = new Set([
      "ArrivalDayView.tsx | · Example schedule",
      "LightWindowPanel.tsx | Example plan.",
      "LightWindowPanel.tsx | Plan preview.",
      "NudgeFeedScreen.tsx | Example traveller — not your measurements.",
      "PerformanceBrief.tsx | Example event ·",
      "PerformanceBrief.tsx | Example sleep profile ·",
      "PerformanceBrief.tsx | Plan preview ·",
      "PerformanceBrief.tsx | This estimate overlaps the example sleep window.",
      "ScenarioExperience.tsx | Example route",
      "TasteItineraryCard.tsx | Example schedule · Qloo place ideas",
      "TripSetupScreen.tsx | Using an example calendar",
      "TripSetupScreen.tsx | Using example sleep data",
    ]);

    const found = new Set<string>();
    for (const file of CHROME) {
      for (const m of read(file).matchAll(/(["'])((?:(?!\1)[^\\\n]|\\.){3,90})\1/g)) {
        const text = m[2].replace(/\s+/g, " ").trim();
        if (!/\b(example|preview|sample|not booked|not your|not measured)\b/i.test(text)) continue;
        if (!/[a-z] [a-z]/i.test(text) || /[;{}()$:]|--/.test(text) || text.length > 60) continue;
        found.add(`${bare(file)} | ${text}`);
      }
    }

    const extras = [...found].filter((f) => !HEDGES.has(f));
    expect(extras, "new hedging phrase — name the state once, upstream").toEqual([]);
    for (const known of HEDGES) {
      expect([...found], `hedging phrase retired: ${known} (cut it from HEDGES too)`).toContain(known);
    }
  });
});
