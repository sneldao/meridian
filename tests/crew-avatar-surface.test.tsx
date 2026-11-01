import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CrewAvatar, type CrewAvatarState } from "../src/components/CrewAvatar";
import { CREW } from "../src/agents/crew";
import type { AgentId } from "../src/domain/types";

/* The crew avatars (round 31) are SSR-complete: distinct glyph, state and
 * accessible name per agent, zero inline styles, and a decorative mode that
 * hides them from the tree when a text name sits beside them. */

const AGENTS: AgentId[] = ["analyst", "researcher", "planner", "evaluator", "negotiator"];
const STATES: CrewAvatarState[] = [
  "resting", "attentive", "working", "explaining", "concerned", "complete",
];

describe("CrewAvatar (SSR)", () => {
  test("each agent renders a distinct labelled figure", () => {
    const bodies = new Set<string>();
    for (const id of AGENTS) {
      const h = renderToStaticMarkup(createElement(CrewAvatar, { id }));
      expect(h).toContain(`data-agent="${id}"`);
      expect(h).toContain('data-state="resting"');
      expect(h).toContain('role="img"');
      expect(h).toContain(`${CREW[id].name},`);
      bodies.add(h.replace(`data-agent="${id}"`, ""));
    }
    expect(bodies.size).toBe(AGENTS.length);
  });

  test("every state is written to the markup", () => {
    for (const state of STATES) {
      const h = renderToStaticMarkup(createElement(CrewAvatar, { id: "planner", state }));
      expect(h).toContain(`data-state="${state}"`);
    }
  });

  test("Mara and Jun carry their personality hooks in the markup", () => {
    // The states are poses in CSS, but the poses need the parts: Mara's
    // bite-fill disc (complete tips her near-full) and horn glint, Jun's
    // spark inside the star and his magnifier lens.
    const mara = renderToStaticMarkup(createElement(CrewAvatar, { id: "analyst", state: "complete" }));
    expect(mara).toContain("ca-fill");
    expect(mara).toContain("ca-glint");
    const jun = renderToStaticMarkup(createElement(CrewAvatar, { id: "researcher", state: "explaining" }));
    expect(jun).toContain("ca-spark");
    expect(jun).toContain("ca-lens");
    // The other three agents keep their plain figures — no borrowed parts.
    for (const id of ["planner", "evaluator", "negotiator"] as AgentId[]) {
      const h = renderToStaticMarkup(createElement(CrewAvatar, { id }));
      expect(h).not.toContain("ca-fill");
      expect(h).not.toContain("ca-spark");
    }
  });

  test("decorative avatars leave the accessibility tree", () => {
    const h = renderToStaticMarkup(createElement(CrewAvatar, { id: "evaluator", decorative: true }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).not.toContain('role="img"');
    expect(h).not.toContain("aria-label");
  });

  test("zero inline styles and zero hex anywhere", () => {
    for (const id of AGENTS) {
      const h = renderToStaticMarkup(createElement(CrewAvatar, { id, state: "working", gaze: 0.5 }));
      expect(h).not.toContain("style=");
      expect(h).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });
});
