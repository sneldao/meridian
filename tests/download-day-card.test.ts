import { afterEach, describe, expect, it } from "bun:test";
import { downloadDayCard } from "../src/lib/download-day-card";
import { publicDayCard, snapshotDayCard } from "../src/lib/day-card";
import { buildDayScene } from "../src/domain/day-scene";
import { buildDemoScenario } from "../src/domain/demo-scenarios";

const d = buildDemoScenario("jason", "2026-11-04");
const scene = buildDayScene({ trip: d.trip, dayIndex: d.trip.departureDayIndex + 1, plans: d.plans, calendar: d.calendar, baseline: d.baseline })!;
const card = publicDayCard(snapshotDayCard(scene, { fictionalTrip: true }), { includeSchedule: true, includeEvent: true, includeBodyTime: true, includeTaste: true });

type Spy = { calls: unknown[]; urls: Map<string, string>; revoked: string[]; anchors: { href: string; download: string; clicked: boolean }[] };
const real = { Image: globalThis.Image, document: globalThis.document, URL: globalThis.URL };
let spy: Spy;

function install(opts: { ctxNull?: boolean; blobNull?: boolean; imgErr?: boolean }) {
  spy = { calls: [], urls: new Map(), revoked: [], anchors: [] };
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      queueMicrotask(() => (opts.imgErr ? this.onerror?.() : this.onload?.()));
    }
  }
  const anchors = spy.anchors;
  const fakeAnchor = {
    href: "", download: "", rel: "", clicked: false,
    click() { this.clicked = true; },
    remove() { spy.calls.push(["remove", this]); },
  };
  globalThis.document = {
    createElement(tag: string) {
      if (tag === "a") { anchors.push(fakeAnchor); return fakeAnchor; }
      if (tag === "canvas") {
        return {
          width: 0, height: 0,
          getContext: () => (opts.ctxNull ? null : { drawImage: (...a: unknown[]) => spy.calls.push(a) }),
          toBlob: (cb: (b: Blob | null) => void, mime?: string) => { spy.calls.push(mime); cb(opts.blobNull ? null : new Blob(["png"])); },
        };
      }
      return {} as never;
    },
    body: { appendChild: (el: unknown) => spy.calls.push(["append", el]) },
  } as unknown as Document;
  globalThis.Image = FakeImage as unknown as typeof Image;
  let n = 0;
  globalThis.URL = Object.assign(Object.create(real.URL), {
    createObjectURL: () => { const u = `blob:fake-${n++}`; spy.urls.set(u, "created"); return u; },
    revokeObjectURL: (u: string) => { spy.revoked.push(u); },
  }) as unknown as typeof URL;
  return fakeAnchor;
}

afterEach(() => {
  globalThis.Image = real.Image;
  globalThis.document = real.document;
  globalThis.URL = real.URL;
});

describe("downloadDayCard lifecycle", () => {
  it("svg path creates one URL, triggers named anchor, revokes", async () => {
    const a = install({});
    await downloadDayCard(card, undefined, "svg");
    expect(a.clicked).toBe(true);
    expect(a.download).toBe("meridian-day-card.svg");
    expect(spy.calls.some((c) => Array.isArray(c) && c[0] === "append")).toBe(true);
    expect(spy.calls.some((c) => Array.isArray(c) && c[0] === "remove")).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    expect(spy.revoked.length).toBe(1);
  });

  it("png path draws 1080x1920, names file, revokes both urls", async () => {
    const a = install({});
    await downloadDayCard(card, 0, "png");
    expect(a.download).toBe("meridian-day-card.png");
    expect(spy.calls).toContain("image/png");
    expect(spy.calls[0].slice(1)).toEqual([0, 0, 1080, 1920]);
    await new Promise((r) => setTimeout(r, 1100));
    expect(spy.revoked.length).toBe(2);
  });

  it("canvas/toBlob/image failures reject and still revoke the svg url", async () => {
    for (const opts of [{ ctxNull: true }, { blobNull: true }, { imgErr: true }]) {
      install(opts);
      const a = spy.anchors[spy.anchors.length - 1];
      await expect(downloadDayCard(card, undefined, "png")).rejects.toThrow();
      expect(a?.clicked).not.toBe(true);
      await new Promise((r) => setTimeout(r, 1100));
      expect(spy.revoked.some((u) => u.startsWith("blob:fake"))).toBe(true);
    }
  });
});
