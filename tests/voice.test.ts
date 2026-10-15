import { describe, expect, test } from "bun:test";
import { createNdjsonSplitter, wordsFromAlignment } from "@/lib/voice/align";
import { cleanForTts } from "@/lib/voice/clean";
import { parseOutputFormat, pcmBytesPerSecond } from "@/lib/voice/format";
import { buildHuddle, trimHuddle } from "@/lib/voice/huddle";
import { takeChunks } from "@/lib/voice/split";
import type { DayPlan } from "@/domain/types";

const enc = new TextEncoder();

describe("takeChunks", () => {
  test("emits only complete sentences mid-stream", () => {
    const { chunks, rest } = takeChunks(
      "The first sentence here is long enough to clear the minimum chunk size. And the second is still being written",
      { minChars: 40 },
    );
    expect(chunks.map((c) => c.text)).toEqual([
      "The first sentence here is long enough to clear the minimum chunk size.",
    ]);
    expect(rest).toBe(" And the second is still being written");
  });

  test("does not split on DOIs or decimals", () => {
    const src = "See doi 10.1210/jc.2005-1009 for the trial. Score was 0.95 overall. Done.";
    const { chunks } = takeChunks(src, { flush: true });
    const texts = chunks.map((c) => c.text);
    expect(texts[0]).toContain("10.1210/jc.2005-1009");
    expect(texts[0]).toContain("0.95");
    expect(texts.join("")).toBe(src);
  });

  test("merges short fragments like list markers", () => {
    const { chunks } = takeChunks("3. A real sentence follows here. ", { flush: true });
    expect(chunks.map((c) => c.text)).toEqual(["3. A real sentence follows here. "]);
  });

  test("keeps offsets contiguous for the karaoke map", () => {
    const src = "Alpha bravo charlie delta echo. Foxtrot golf hotel india juliet. Kilo lima.";
    const { chunks } = takeChunks(src, { flush: true });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(src.slice(c.start, c.end)).toBe(c.text);
    expect(chunks[chunks.length - 1].end).toBe(src.length);
  });

  test("hard-splits oversized runs at weak breaks", () => {
    const src = `${"word ".repeat(200)}end`;
    const { chunks } = takeChunks(src, { flush: true, maxChars: 300 });
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(301);
    expect(chunks.map((c) => c.text).join("")).toBe(src);
  });

  test("newline is a boundary on its own", () => {
    const { chunks, rest } = takeChunks("line one\nline two", { minChars: 4 });
    expect(chunks[0].text).toBe("line one\n");
    expect(rest).toBe("line two");
  });
});

describe("cleanForTts", () => {
  test("strips markdown and maps cleaned indices back to the original", () => {
    const { clean, map } = cleanForTts("**bold** `code` ~gone~");
    expect(clean).toBe("bold code gone");
    expect(clean[0]).toBe("b");
    expect(map[0]).toBe(2); // 'b' of **bold**
    for (let i = 0; i < clean.length; i++) {
      expect("**bold** `code` ~gone~"[map[i]]).toBe(clean[i]);
    }
  });

  test("trims outer whitespace and keeps the map aligned", () => {
    const { clean, map } = cleanForTts("  hi  ");
    expect(clean).toBe("hi");
    expect(map[0]).toBe(2);
  });
});

describe("createNdjsonSplitter", () => {
  test("splits newline-delimited objects across byte boundaries", () => {
    const split = createNdjsonSplitter();
    const lines = ['{"a":1}', '{"b":2}'].join("\n");
    const bytes = enc.encode(lines);
    const mid = Math.floor(bytes.length / 2);
    const out = [...split.push(bytes.slice(0, mid)), ...split.push(bytes.slice(mid)), ...split.flush()];
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  test("recovers concatenated objects with no delimiter", () => {
    const split = createNdjsonSplitter();
    const out = split.push(enc.encode('{"a":"x{y}"}{"b":2}'));
    expect(out).toEqual(['{"a":"x{y}"}', '{"b":2}']);
  });
});

describe("wordsFromAlignment", () => {
  test("groups characters into word timings", () => {
    const words = wordsFromAlignment({
      characters: ["h", "i", " ", "y", "o"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.25, 0.4, 0.5],
    });
    expect(words.map((w) => w.text)).toEqual(["hi", "yo"]);
    expect(words[0].end).toBe(0.2);
    expect(words[1].start).toBe(0.3);
  });
});

describe("parseOutputFormat", () => {
  test("parses pcm and mp3 shapes", () => {
    const pcm = parseOutputFormat("pcm_24000");
    expect(pcm.codec).toBe("pcm");
    expect(pcm.sampleRate).toBe(24000);
    expect(pcm.bytesPerSample).toBe(2);
    expect(pcmBytesPerSecond(pcm)).toBe(48000);

    const mp3 = parseOutputFormat("mp3_44100_128");
    expect(mp3.codec).toBe("mp3");
    expect(mp3.bitrateKbps).toBe(128);
    expect(mp3.bytesPerSample).toBe(0);
  });
});

const day = (over: Partial<DayPlan> = {}): DayPlan =>
  ({
    dayIndex: 0,
    label: "D-1",
    shiftMin: -60,
    targetBedtimeMin: 22 * 60,
    targetWakeMin: 6 * 60,
    interventions: [
      {
        kind: "light_exposure",
        startMin: 7 * 60,
        endMin: 7 * 60 + 30,
        note: "bright light within 20 minutes of waking",
      },
    ],
    ...over,
  }) as DayPlan;

describe("buildHuddle", () => {
  test("produces a multi-voice script off real run data", () => {
    const lines = buildHuddle({
      score: 0.91,
      days: [day(), day({ dayIndex: 1, label: "D-2", targetBedtimeMin: 21 * 60, targetWakeMin: 5 * 60 })],
      coverage: { ratio: 0.75, complete: false, achievedMin: 90, requiredMin: 120, residualMin: 30 },
      citationTitles: ["Timed light exposure phase-shifts the clock"],
    });
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(new Set(lines.map((l) => l.agent)).size).toBeGreaterThan(2);
    expect(lines.map((l) => l.text).join(" ")).toContain("0.91");
  });

  test("returns nothing without days", () => {
    expect(buildHuddle({ score: 1, days: [] })).toEqual([]);
  });
});

describe("trimHuddle", () => {
  test("caps the transcript under the dialogue limit", () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({
      agent: "planner" as const,
      text: "x".repeat(300) + String(i),
    }));
    const trimmed = trimHuddle(lines);
    expect(trimmed.reduce((n, l) => n + l.text.length, 0)).toBeLessThanOrEqual(2000);
  });
});
