"use client";

import { useEffect, useRef, useState } from "react";

/* One traveller speaks at a time. `toggle(id, src)` plays the line through a
 * single shared Audio element: a second press on the same id stops it, a
 * press on another id hands the line over, `ended` settles the icon back.
 * The press is the gesture, so playback is always permitted. */
export function useVoiceLine() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [],
  );

  const toggle = (id: string, src: string) => {
    const settle = () => setSpeaking((s) => (s === id ? null : s));
    if (audio.current && speaking === id) {
      audio.current.pause();
      audio.current = null;
      setSpeaking(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(src);
    a.addEventListener("ended", settle);
    audio.current = a;
    setSpeaking(id);
    void a.play().catch(settle);
  };

  return { speaking, toggle };
}
