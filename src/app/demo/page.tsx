import type { Metadata } from "next";
import { DemoBeats } from "@/components/DemoBeats";

export const metadata: Metadata = {
  title: "Meridian — the ninety-second example",
  description:
    "Your meeting is at 16:00 Tokyo time and your body thinks it's 07:00. Watch a crew of agents move it — the stakes, the plan, the honest payoff.",
  openGraph: {
    title: "Meridian — the ninety-second example",
    description:
      "Your meeting is at 16:00 Tokyo time and your body thinks it's 07:00. Watch a crew of agents move it.",
    siteName: "Meridian",
    type: "website",
    // Generated from the real demo journey by scripts/make-og-demo.ts —
    // the preview shows the same passport the payoff beat stamps.
    images: [{ url: "/og-demo.png", width: 2400, height: 1260, alt: "Meridian — the ninety-second example" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meridian — the ninety-second example",
    description:
      "Your meeting is at 16:00 Tokyo time and your body thinks it's 07:00. Watch a crew of agents move it.",
    images: ["/og-demo.png"],
  },
};

/* The send-a-link demo (round 19). "Try the example" lands here instead of
 * on the full Today screen: four beats, skip controls, every number from
 * the solver. /?demo=1 and /demo are the same door. */
export default function DemoPage() {
  return (
    <main className="root demo-root">
      <DemoBeats />
    </main>
  );
}
