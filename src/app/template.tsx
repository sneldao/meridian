"use client";

import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NAV_BACK, NAV_FADE, NAV_FORWARD } from "@/lib/nav-transitions";

/* Dawn sweep (docs/DESIGN.md · Motion) — the brand's terminator hairline crosses
   the frame once as each route mounts. The content itself is wrapped in a
   ViewTransition so a navigation can carry direction: links tagged
   `transitionTypes={["nav-forward"]}` slide in from the right, `nav-back`
   returns from the left, and untyped navigations — the browser back button
   included — fade instead of hard-swapping. Browsers without the View
   Transitions API simply swap — the sweep still lands, and templates remount
   per navigation so the hairline is naturally one-shot.

   Scroll: a route push must land at the top — the transition can otherwise
   snapshot and hold the previous page's scroll offset, which is how a
   traveller ends up halfway down a fresh page. History traversals keep the
   position the browser restores. The Navigation API reports traversal vs
   push; without it we reset unconditionally — the pages here are short
   enough that landing top on back is the better trade. */
function sweepGroup(path: string): "landing" | "app" {
  // Brand sweep only across groups (landing <-> app), not on every tab switch.
  if (path === "/" || path.startsWith("/demo") || path.startsWith("/arrival")) return "landing";
  return "app";
}

export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const traversal = useRef(false);
  const prevGroup = useRef<string | null>(null);
  const [sweepKey, setSweepKey] = useState(0);
  useEffect(() => {
    const nav = (window as { navigation?: EventTarget & { currentEntry?: unknown } }).navigation;
    if (!nav) return;
    const onNavigate = (e: Event) => {
      traversal.current = (e as { navigationType?: string }).navigationType === "traverse";
    };
    nav.addEventListener("navigate", onNavigate);
    return () => nav.removeEventListener("navigate", onNavigate);
  }, []);
  useEffect(() => {
    const group = sweepGroup(pathname);
    if (prevGroup.current !== null && prevGroup.current !== group) {
      setSweepKey((k) => k + 1);
    }
    prevGroup.current = group;
    if (traversal.current) {
      traversal.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <>
      {sweepKey > 0 && <div key={sweepKey} className="dawn-sweep" aria-hidden="true" />}
      <ViewTransition
        enter={{
          [NAV_FORWARD]: NAV_FORWARD,
          [NAV_BACK]: NAV_BACK,
          default: NAV_FADE,
        }}
        exit={{
          [NAV_FORWARD]: NAV_FORWARD,
          [NAV_BACK]: NAV_BACK,
          default: NAV_FADE,
        }}
        default={NAV_FADE}
      >
        <div className="page-enter">{children}</div>
      </ViewTransition>
    </>
  );
}
