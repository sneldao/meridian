"use client";

import { useEffect, useRef } from "react";

/* Shared Filament lifecycle (codrops port, src/lib/tca): build after fonts
   are ready, play the letter-catch once, or seat the text at once under
   reduced motion / no WebGL2. The DOM line keeps layout + its accessible
   label the whole time; cleanup hands the text back untouched. */
export function useFilament<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let effect: { play(): void; show(): void; refresh?(): void } | null = null;
    document.fonts.ready.then(async () => {
      if (cancelled) return;
      try {
        await import("@/lib/tca/gsap-globals");
        const { Filament } = await import("@/lib/tca/filament");
        if (cancelled) return;
        effect = new Filament(el);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced || !window.WebGL2RenderingContext) effect.show();
        else effect.play();
      } catch {
        /* the plain text stands */
      }
    });
    return () => {
      cancelled = true;
      try {
        effect?.show();
      } catch {
        /* the plain text stands */
      }
    };
  }, [enabled]);
  return ref;
}
