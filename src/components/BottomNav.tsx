"use client";

// The phone's tab bar.
//
// On a desktop the app is a document: a column you read, with a menu in the
// corner. On a phone that is the wrong shape — a corner menu is out of thumb
// reach, and the app is a thing you *use*, not a page you read.
//
// So below the phone width the app gets a tab bar: Today (the step in front
// of you), Clock (the dial and the day's action), Plan (the saved plan) and
// Trips (the past). The overflow — the crew surface, the shift week, the trip
// settings, the disclosure — stays in the menu, which is what a menu is for.
//
// Today and Clock are two views of the same plan, so they switch in place;
// Plan and Trips are pages, so they navigate. Above the phone width the bar
// is hidden, and the home page's own view toggle governs.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, History, Home, Sun } from "lucide-react";

export type BottomTab = "today" | "clock" | "plan" | "trips";

export interface BottomNavProps {
  /** Which of the two home views is showing. On the home page the two are
   *  views of one plan, so they switch in place; on the other pages they are
   *  links. */
  view?: "today" | "clock";
  onViewChange?: (view: "today" | "clock") => void;
}

const HOME_TABS = [
  { id: "today" as const, label: "Today", Icon: Home },
  { id: "clock" as const, label: "Clock", Icon: Sun },
];

export function BottomNav({ view, onViewChange }: BottomNavProps) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {HOME_TABS.map(({ id, label, Icon }) =>
        onViewChange ? (
          <button
            key={id}
            type="button"
            className="bottom-nav-item"
            aria-current={view === id ? "page" : undefined}
            onClick={() => onViewChange(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ) : (
          <Link
            key={id}
            href={id === "clock" ? "/?view=clock" : "/"}
            className="bottom-nav-item"
            aria-current={pathname === "/" && view === id ? "page" : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ),
      )}
      <Link
        href="/review"
        className="bottom-nav-item"
        aria-current={pathname.startsWith("/review") ? "page" : undefined}
      >
        <CalendarClock size={18} aria-hidden="true" />
        <span>Plan</span>
      </Link>
      <Link
        href="/history"
        className="bottom-nav-item"
        aria-current={pathname.startsWith("/history") ? "page" : undefined}
      >
        <History size={18} aria-hidden="true" />
        <span>Trips</span>
      </Link>
    </nav>
  );
}
