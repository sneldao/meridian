"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis, History, Home } from "lucide-react";
import { MoreSheet } from "@/components/MoreSheet";
import { useMorphTransition } from "@/lib/use-morph-transition";
import { NAV_BACK, NAV_FORWARD } from "@/lib/nav-transitions";

/* Two tabs, shaped like the journey: what do I do today, and what happened
   on my trips. The plan is a view of Today (the Now / The plan switch), and
   the payoff lives on the trip it belongs to — so neither gets a tab. */
const TABS = [
  { href: "/", label: "Today", Icon: Home, active: (p: string) => p === "/" },
  { href: "/history", label: "Trips", Icon: History, active: (p: string) => p.startsWith("/history") },
];

/** Pages with no tab of their own — they live under More or hang off a trip,
 *  so the tab shows where the traveller is standing rather than claiming
 *  they're on Today. */
const MORE_PATHS = ["/crew", "/shift", "/team", "/arrival", "/outcome", "/review"];

export function BottomNav() {
  const pathname = usePathname();
  // The sheet is open *at the path it was opened on*: a place link navigates
  // without closing it first (the row must survive into the transition's old
  // snapshot to morph into the destination header), and the derived mismatch
  // folds it away the moment the route changes — no effect, no flash.
  const [moreOpenedAt, setMoreOpenedAt] = useState<string | null>(null);
  const moreOpen = moreOpenedAt !== null && moreOpenedAt === pathname;
  const morph = useMorphTransition();
  const currentIdx = TABS.findIndex((t) => t.active(pathname));
  const onMorePage = MORE_PATHS.some((p) => pathname.startsWith(p));
  return (
    <>
      <nav className="bottom-nav" aria-label="Sections">
        <span
          className="bottom-nav-pill"
          aria-hidden="true"
          data-idx={currentIdx >= 0 ? currentIdx : undefined}
          data-hidden={currentIdx < 0 || undefined}
        />
        {TABS.map(({ href, label, Icon, active }, i) => (
          <Link
            key={href}
            href={href}
            className="bottom-nav-item"
            aria-label={label}
            aria-current={active(pathname) ? "page" : undefined}
            transitionTypes={[currentIdx >= 0 && i > currentIdx ? NAV_FORWARD : NAV_BACK]}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`bottom-nav-item${moreOpen ? "" : " vt-morph-more"}`}
          aria-label="More"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          data-on={onMorePage || undefined}
          onClick={() => morph(() => setMoreOpenedAt(pathname))}
        >
          <Ellipsis size={18} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => morph(() => setMoreOpenedAt(null))} />
    </>
  );
}
