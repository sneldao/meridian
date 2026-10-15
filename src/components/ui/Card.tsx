"use client";

import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** The panel surface: ink-2 fill, one hairline border, xl radius.
 *  Callers layer padding and extra borders on top via className. */
export function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-ink-2", className)}
      {...rest}
    />
  );
}
