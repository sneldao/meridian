import type { Metadata } from "next";
import { DemoBeats } from "@/components/DemoBeats";

export const metadata: Metadata = {
  title: "Meridian — the ninety-second example",
  description:
    "The stakes, the crew, the plan, the payoff — the example trip told as a story, computed live.",
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
