"use client";

/* Design reset Phase 2 — the glass instrument is the renderer for every
 * surface (landing statement, stage sky, interactive day, passport).
 * This stays a compatibility re-export so the six consumers keep their
 * imports; the public SunSelfProps surface is unchanged. */
export { GlassSun as SunSelf } from "./GlassSun";
export type { SunSelfProps } from "./GlassSun";
