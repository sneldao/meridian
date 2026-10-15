// Portals a dropdown's content to document.body, positioned just under an
// anchor element.
//
// Why this exists: the header is `overflow-x-auto` (keeps the toolbar on one
// line at 1200px — design-vision.md §8), and CSS overflow clipping applies to
// absolutely-positioned descendants too, not just normal-flow ones. Any
// dropdown rendered inline inside the header — `position: absolute; top:
// full` — is invisible the moment it's taller than the header row, even
// though its own bounding rect looks perfectly normal in devtools. Portaling
// out to `document.body` with `position: fixed` sidesteps the header's
// clipping box entirely.
"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  children: ReactNode;
}

export function AnchoredPopover({ anchorRef, align = "right", children }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(anchorRef.current?.getBoundingClientRect() ?? null);
  }, [anchorRef]);

  if (!rect) return null;

  const style: CSSProperties = {
    position: "fixed",
    top: rect.bottom + 8,
    zIndex: 50,
    ...(align === "right"
      ? { right: Math.max(8, window.innerWidth - rect.right) }
      : { left: rect.left }),
  };

  return createPortal(
    <div style={style}>{children}</div>,
    document.body,
  );
}
