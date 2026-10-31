import { shiftMinToDeg } from "@/domain/dawn-layers";

/* The image Meridian is recognised by, in miniature: the real terminator
   (light) and the ghost dawn (blue) separated by the minutes still owed —
   the same shiftMinToDeg the dial uses, so a card's gap is the model's
   gap, not a decorative one. Fused when nothing is owed. Shared by every
   opengraph-image so the brand motif renders identically everywhere. */
export function DawnDisc({ owedMin, px = 200 }: { owedMin: number; px?: number }) {
  const deg = Math.min(120, Math.abs(shiftMinToDeg(owedMin)));
  return (
    <svg width={px} height={px} viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="88" fill="#10141f" stroke="#e99a6f" strokeOpacity="0.35" />
      <path d="M100,12 A88,88 0 0 1 100,188 L100,100 Z" fill="#D96B43" fillOpacity="0.5" />
      <line x1="100" y1="12" x2="100" y2="188" stroke="#f5efe6" strokeWidth="3" />
      {deg > 0 && (
        <line
          x1="100"
          y1="12"
          x2="100"
          y2="188"
          stroke="#9db8ff"
          strokeWidth="2.5"
          transform={`rotate(${deg} 100 100)`}
        />
      )}
      <circle cx="100" cy="100" r="88" fill="none" stroke="#e99a6f" strokeOpacity="0.5" />
    </svg>
  );
}
