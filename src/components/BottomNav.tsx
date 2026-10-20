"use client";

// The bottom nav — for the phone.
//
// On a desktop the app is a document: a column you read, with a menu in the
// corner. On a phone that is the wrong shape — a corner menu is out of thumb
// reach, and the app is a thing you *use*, not a page you read.
//
// So below the phone width the app gets a tab bar. It is not a new product:
// the same surfaces, reachable with a thumb, with the overflow (the crew
// surface, the shift week, the trip settings) still in the menu.
//
// Hidden by CSS above the phone width, so the desktop surface is untouched.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, History, Home } from "lucide-react";

const TABS = [
  { href: "/", label: "Today", Icon: Home },
  { href: "/review", label: "Plan", Icon: CalendarClock },
  { href: "/history", label: "Trips", Icon: History },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="bottom-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
