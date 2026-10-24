import type { ReactNode } from "react";

/* Dawn sweep (design.md · Motion) — the brand's terminator hairline crosses
   the frame once as each route mounts, and the content fades in under it.
   Pure CSS and one-shot (templates remount per navigation). The wrapper
   animates opacity only: a transform here would trap `position: fixed`
   overlays (the setup scene, the edit sheet) inside the wrapper while it
   plays. The reduced-motion global rule flattens both animations to their
   end states — content visible, sweep gone. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="dawn-sweep" aria-hidden="true" />
      <div className="page-enter">{children}</div>
    </>
  );
}
