import { ViewTransition, type ReactNode } from "react";

/* Dawn sweep (design.md · Motion) — the brand's terminator hairline crosses
   the frame once as each route mounts. The content itself is wrapped in a
   ViewTransition so a navigation can carry direction: links tagged
   `transitionTypes={["nav-forward"]}` slide in from the right, `nav-back`
   returns from the left, and anything untyped swaps without motion (the
   browser back button included). Browsers without the View Transitions API
   simply swap — the sweep still lands, and templates remount per navigation
   so the hairline is naturally one-shot.

   The wrapper stays transform-free outside the transition: a long-lived
   transform would trap `position: fixed` overlays (the setup scene, the
   edit sheet) inside it. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="dawn-sweep" aria-hidden="true" />
      <ViewTransition
        enter={{
          "nav-forward": "nav-forward",
          "nav-back": "nav-back",
          default: "none",
        }}
        exit={{
          "nav-forward": "nav-forward",
          "nav-back": "nav-back",
          default: "none",
        }}
        default="none"
      >
        <div className="page-enter">{children}</div>
      </ViewTransition>
    </>
  );
}
