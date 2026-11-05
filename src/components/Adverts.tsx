"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useReducedMotion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Stamp } from "@/components/ui/Stamp";
import { useVoiceLine } from "@/lib/use-voice-line";

/* The screening room, split across the entry stage: <AdvertsFeature/> is
 * the featured frame — the second column of `.landing-entry-stage`, the
 * "who" beside the ask — and <AdvertsRail/> renders immediately after the
 * stage, full width, with the section heading, the three travellers'
 * tiles and the caption. <Adverts> is the shared state for the pair; the
 * two read as one unit: form left, tall vertical film right, tiles below.
 *
 * The rail's clips stay muted loops and move only while ≥40% on screen
 * (IntersectionObserver — never a rAF, never ambient); reduced motion
 * never attaches the observer and the posters stand in. Tapping a tile is
 * the gesture: that traveller takes the frame and plays with sound. The
 * speaker on each tile reads their one line. */
type Advert = {
  id: string;
  label: string;
  still: string;      /* the feature frame's poster */
  feature: string;    /* the frame's clip — also the tile's muted loop */
  tilePoster?: string; /* when the tile's poster isn't the still */
  voice: string;
};

/* The cast names are the personas' first names; the ids stay the
   scenarios' opaque keys (miles/danny), not the cast's. */
const CAST: Advert[] = [
  {
    id: "diego",
    label: "Diego",
    still: "/ads/diego.webp",
    feature: "/ads/diego-full.mp4",
    voice: "/ads/diego-voice.mp3",
  },
  {
    id: "miles",
    label: "Marcus",
    still: "/ads/marcus.webp",
    feature: "/ads/marcus-full.mp4",
    voice: "/ads/marcus-voice.mp3",
  },
  {
    id: "danny",
    label: "Earl",
    still: "/ads/earl.webp",
    feature: "/ads/c2a.mp4",
    tilePoster: "/ads/c2a-poster.webp",
    voice: "/ads/earl-voice.mp3",
  },
];

interface AdvertsValue {
  rail: RefObject<HTMLDivElement | null>;
  frame: RefObject<HTMLVideoElement | null>;
  featured: number;
  playing: boolean;
  voice: ReturnType<typeof useVoiceLine>;
  /** A tile tap seats that traveller in the frame — the gesture that lets
      the clip play unmuted. Re-tapping the seated traveller counts too. */
  seat: (i: number) => void;
  togglePlay: () => void;
  setPlaying: (v: boolean) => void;
}

const AdvertsCtx = createContext<AdvertsValue | null>(null);

export function Adverts({ children }: { children?: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [featured, setFeatured] = useState(0);
  /* Each tile tap bumps the take — the gesture that lets the frame play
     unmuted. */
  const [take, setTake] = useState(0);
  const [playing, setPlaying] = useState(false);
  const voice = useVoiceLine();

  /* The rail's ambient motion: a tile plays only while ≥40% of it is on
     screen and pauses the moment it leaves. Reduced motion never attaches
     the observer — the posters stand in for the clips. */
  useEffect(() => {
    if (reduce) return;
    const el = rail.current;
    if (!el) return;
    const clips = [...el.querySelectorAll<HTMLVideoElement>(".ad-clip")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) void v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.4 },
    );
    for (const v of clips) io.observe(v);
    return () => io.disconnect();
  }, [reduce]);

  /* A tile tap is the user gesture — the chosen traveller takes the frame
     with sound. Runs only after a real tap; on load the frame holds the
     poster. */
  useEffect(() => {
    if (take === 0) return;
    const v = frame.current;
    if (!v) return;
    v.muted = false;
    void v.play().catch(() => {});
  }, [take]);

  const togglePlay = () => {
    const v = frame.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  return (
    <AdvertsCtx.Provider
      value={{
        rail,
        frame,
        featured,
        playing,
        voice,
        seat: (i) => {
          setFeatured(i);
          setTake((t) => t + 1);
        },
        togglePlay,
        setPlaying,
      }}
    >
      {children}
    </AdvertsCtx.Provider>
  );
}

function useAdverts() {
  const v = useContext(AdvertsCtx);
  if (!v) throw new Error("AdvertsFeature/AdvertsRail must render inside <Adverts>");
  return v;
}

/* The featured frame — the stage's second column: one tall vertical film
   with the seated traveller's name tag and the big play/pause. */
export function AdvertsFeature() {
  const { frame, featured, playing, togglePlay, setPlaying } = useAdverts();
  const ad = CAST[featured];
  return (
    <div className="ad-feature" data-playing={playing || undefined}>
      <video
        ref={frame}
        src={ad.feature}
        poster={ad.still}
        playsInline
        preload="none"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        className="ad-play taste-button taste-button--ghost"
        onClick={togglePlay}
        aria-label={playing ? `Pause ${ad.label}'s advert` : `Play ${ad.label}'s advert`}
      >
        {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
      </button>
      <span className="ad-name">{ad.label}</span>
    </div>
  );
}

/* The rail beneath the stage — the section heading, the three tiles and
   the transcript caption with its FICTIONAL stamp. */
export function AdvertsRail() {
  const { rail, featured, voice, seat } = useAdverts();
  return (
    <section className="adverts" aria-labelledby="adverts-heading">
      <p className="entry-eyebrow">Meet the travellers</p>
      <h2 id="adverts-heading">They fly like you do.</h2>
      <div className="ad-rail" ref={rail}>
        {CAST.map((c, i) => (
          <div key={c.id} className={`ad-tile${i === featured ? " ad-tile--on" : ""}`}>
            <button
              type="button"
              className="ad-tile-btn"
              aria-pressed={i === featured}
              aria-label={`Watch ${c.label}'s advert`}
              onClick={() => seat(i)}
            >
              <video
                className="ad-clip"
                src={c.feature}
                poster={c.tilePoster ?? c.still}
                muted
                loop
                playsInline
                preload="none"
                tabIndex={-1}
                aria-hidden="true"
              />
              <span className="ad-tile-name" aria-hidden="true">{c.label}</span>
            </button>
            <button
              type="button"
              className="ad-voice"
              aria-pressed={voice.speaking === c.id}
              aria-label={`Hear ${c.label}'s line`}
              onClick={() => voice.toggle(c.id, c.voice)}
            >
              {voice.speaking === c.id ? (
                <VolumeX size={15} aria-hidden="true" />
              ) : (
                <Volume2 size={15} aria-hidden="true" />
              )}
            </button>
          </div>
        ))}
      </div>
      <p className="ad-caption">
        “I have a system for everything. Podcasts on 2X, poker ranges
        memorized. Jet lag still beats me. Every single trip.”{" "}
        <Stamp kind="fictional" />
      </p>
    </section>
  );
}
