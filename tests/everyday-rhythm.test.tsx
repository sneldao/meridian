import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EverydayRhythm } from "@/components/EverydayRhythm";

describe("EverydayRhythm (SSR)", () => {
  test("renders the three everyday circadian anchors", () => {
    const html = renderToStaticMarkup(<EverydayRhythm />);
    expect(html).toContain("Everyday rhythm");
    expect(html).toContain("Morning light");
    expect(html).toContain("Caffeine curfew");
    expect(html).toContain("Evening wind-down");
  });
});
