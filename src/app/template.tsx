"use client";

import { ViewTransition, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

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
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const traversal = useRef(false);
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
    if (traversal.current) {
      traversal.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <>
      <div className="dawn-sweep" aria-hidden="true" />
      <ViewTransition
        enter={{
          "nav-forward": "nav-forward",
          "nav-back": "nav-back",
          default: "nav-fade",
        }}
        exit={{
          "nav-forward": "nav-forward",
          "nav-back": "nav-back",
          default: "nav-fade",
        }}
        default="nav-fade"
      >
        <div className="page-enter">{children}</div>
      </ViewTransition>
    </>
  );
}
