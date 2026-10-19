"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** The secondary-page header: a back link, a sentence-case title, and an
 *  optional actions slot on the right. */
export function PageHeader({
  title,
  backHref = "/",
  backLabel = "← Back to my plan",
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
        <Link href={backHref} className="text-xs text-clay-2 hover:text-clay">
          {backLabel}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-clay">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
