import { cn } from "@/lib/cn";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "pass" | "fail" | "progress" | "ghost" | "sleep";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        variant === "default" && "border border-line bg-ink text-mist",
        variant === "pass" && "border border-pass/20 bg-pass/10 text-pass",
        variant === "fail" && "border border-fail/20 bg-fail/10 text-fail",
        variant === "progress" && "border border-progress/20 bg-progress/10 text-progress",
        variant === "ghost" && "border border-ghost/20 bg-ghost/10 text-ghost",
        variant === "sleep" && "border border-sleep/20 bg-sleep/10 text-sleep",
        className,
      )}
    >
      {children}
    </span>
  );
}
