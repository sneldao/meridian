"use client";

import { cn } from "@/lib/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  active?: boolean;
}

/** The one action shape. Paper is the action colour; ghost is chrome;
 *  danger is the reserved fail state — never an agent, never the sun. */
export function Button({
  variant = "primary",
  size = "md",
  active = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-all duration-fast ease-smooth-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        disabled
          ? "cursor-not-allowed bg-line text-dim"
          : active
            ? "bg-paper text-ink"
            : variant === "primary" && "bg-paper text-ink hover:bg-white",
        !disabled && !active && variant === "ghost" && "border border-line text-mist hover:border-mist hover:text-paper",
        !disabled && !active && variant === "danger" && "border border-fail/20 bg-fail/5 text-fail hover:bg-fail/10",
        !disabled && !active && variant === "secondary" && "bg-line text-paper hover:bg-ink-3",
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
