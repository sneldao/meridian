"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Ellipsis, History, Home } from "lucide-react";
import { MoreSheet } from "@/components/MoreSheet";

const TABS = [
  { href: "/", label: "Today", Icon: Home, active: (p: string) => p === "/" },
  { href: "/review", label: "My plan", Icon: CalendarClock, active: (p: string) => p.startsWith("/review") },
  { href: "/history", label: "Trips", Icon: History, active: (p: string) => p.startsWith("/history") },
];

/** Pages with no tab of their own — they live under More, so the tab shows
 *  where the traveller is standing rather than claiming they're on Today. */
const MORE_PATHS = ["/crew", "/shift", "/team", "/arrival", "/outcome"];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const currentIdx = TABS.findIndex((t) => t.active(pathname));
  const onMorePage = MORE_PATHS.some((p) => pathname.startsWith(p));
  return (
    <>
      <nav className="bottom-nav" aria-label="Sections">
        {TABS.map(({ href, label, Icon, active }, i) => (
          <Link
            key={href}
            href={href}
            className="bottom-nav-item"
            aria-label={label}
            aria-current={active(pathname) ? "page" : undefined}
            transitionTypes={[currentIdx >= 0 && i > currentIdx ? "nav-forward" : "nav-back"]}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="bottom-nav-item"
          aria-label="More"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          data-on={onMorePage || undefined}
          onClick={() => setMoreOpen(true)}
        >
          <Ellipsis size={18} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
