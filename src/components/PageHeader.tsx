"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreNav } from "@/components/MoreSheet";

/** The secondary-page header: a back link, a sentence-case title, and an
 *  optional actions slot on the right. The More affordance keeps every
 *  secondary page one hop from the other surfaces on screens wide enough to
 *  lack the tab bar's More tab. */
export function PageHeader({
  title,
  backHref = "/",
  backLabel = "← Back to today",
  actions,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <Link href={backHref} transitionTypes={["nav-back"]} className="text-xs text-clay-2 hover:text-clay">
          {backLabel}
        </Link>
        <h1 className="page-title mt-2">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actions}
        <MoreNav className="hidden text-xs text-clay-2 hover:text-clay sm:inline" />
      </div>
    </header>
  );
}
