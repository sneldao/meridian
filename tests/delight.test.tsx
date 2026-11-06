import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readStylesheet } from "./css";
import { UndoToastCard, TOAST_MS, TOAST_EXIT_MS } from "@/components/UndoToast";
import { HistoryEmpty } from "@/app/history/page";
import { CheckInSent } from "@/components/MorningCheckin";

/* Delight pass — the four beats render their promise in markup and in the
 * stylesheet: the toast drains visibly and glides out, the history
 * before-anything state offers its one next step, the check-in answers
 * back, and the arrival stamp lands after the passport rises. */

describe("UndoToastCard", () => {
  test("arrives with its message, an Undo button, and the draining bar", () => {
    const h = renderToStaticMarkup(
      createElement(UndoToastCard, { message: "Trip saved", leaving: false, onUndo: () => {} }),
    );
    expect(h).toContain("Trip saved");
    expect(h).toContain("Undo");
    expect(h).toContain("toast-life");
    expect(h).toContain("toast-in");
    expect(h).not.toContain("toast-out");
    expect(h).toContain('role="status"');
  });

  test("leaving swaps the spring for the glide, keeping the message", () => {
    const h = renderToStaticMarkup(
      createElement(UndoToastCard, { message: "Trip saved", leaving: true, onUndo: () => {} }),
    );
    expect(h).toContain("toast-out");
    expect(h).not.toContain("toast-in");
    expect(h).toContain("Trip saved");
  });

  test("the exit beat fits inside the toast's lifetime", () => {
    expect(TOAST_EXIT_MS).toBeGreaterThanOrEqual(180);
    expect(TOAST_MS - TOAST_EXIT_MS).toBeGreaterThan(0);
  });
});

describe("HistoryEmpty", () => {
  test("an open sky with the one step that fills it", () => {
    const h = renderToStaticMarkup(createElement(HistoryEmpty));
    expect(h).toContain("the sky is clear");
    expect(h).toContain("arrival report");
    expect(h).toContain('href="/"');
    expect(h).toContain("Plan your first trip");
  });
});

describe("CheckInSent", () => {
  test("answers back while the crew takes its minute", () => {
    const h = renderToStaticMarkup(createElement(CheckInSent));
    expect(h).toContain('role="status"');
    expect(h).toContain("the crew");
    expect(h).toContain("about a minute");
  });
});

describe("delight stylesheet", () => {
  const css = readStylesheet();

  test("the toast bar drains over five seconds and hides under reduced motion", () => {
    expect(css).toContain("@keyframes toast-life-drain");
    expect(css).toContain(".toast-life");
    expect(css).toContain("animation: toast-life-drain 5s linear");
  });

  test("the glide-out snaps off under reduced motion", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toContain(".toast-out");
  });

  test("the arrival stamp slams after the passport's rise beat", () => {
    expect(css).toContain("@keyframes arr-stamp-slam");
    expect(css).toContain(".arr-in .arr-passport-stamp");
    expect(css).toContain("2050ms");
  });
});
