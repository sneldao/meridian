"use client";

import { useRef, type PointerEvent, type RefObject } from "react";
import { cn } from "@/lib/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  active?: boolean;
  /** Opt-in: the button leans toward a nearby pointer and springs back. */
  magnetic?: boolean;
}

const TRIGGER_RADIUS = 150;
const PULL = 0.3;

/* Magnetic pull is a pointer-driven `translate`, written straight to the
   element with no React re-render. Reduced motion and touch never arm it. */
function useMagnetic(ref: RefObject<HTMLButtonElement | null>, enabled: boolean) {
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!enabled || !el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const near = Math.hypot(dx, dy) < TRIGGER_RADIUS;
    el.style.translate = near ? `${(dx * PULL).toFixed(1)}px ${(dy * PULL).toFixed(1)}px` : "";
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.translate = "";
  };
  return { onMove, onLeave };
}

/** The one action shape. Paper is the action colour; ghost is chrome;
 *  danger is the reserved fail state — never an agent, never the sun. */
export function Button({
  variant = "primary",
  size = "md",
  active = false,
  magnetic = false,
  className,
  disabled,
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const magnet = useMagnetic(ref, magnetic && !disabled);
  return (
    <button
      ref={ref}
      onPointerMove={(e) => {
        magnet.onMove(e);
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        magnet.onLeave();
        onPointerLeave?.(e);
      }}
      className={cn(
        "ui-btn inline-flex items-center justify-center gap-2 font-medium transition-all duration-fast ease-smooth-out",
        variant === "primary" ? "rounded-lg" : "rounded-md",
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
