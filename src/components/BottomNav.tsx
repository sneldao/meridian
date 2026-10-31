"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, History, Home } from "lucide-react";

const TABS = [
  { href: "/", label: "Today", Icon: Home, active: (p: string) => p === "/" },
  { href: "/review", label: "My plan", Icon: CalendarClock, active: (p: string) => p.startsWith("/review") },
  { href: "/history", label: "Trips", Icon: History, active: (p: string) => p.startsWith("/history") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {TABS.map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          className="bottom-nav-item"
          aria-label={label}
          aria-current={active(pathname) ? "page" : undefined}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
