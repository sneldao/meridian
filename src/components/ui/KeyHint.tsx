import { cn } from "@/lib/cn";

export interface KeyHintProps {
  children: React.ReactNode;
  className?: string;
}

export function KeyHint({ children, className }: KeyHintProps) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded border border-line bg-ink px-1 py-0.5 font-mono2 text-2xs leading-none text-mist",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
