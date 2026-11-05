/* The ported codrops effects read `gsap` and `SplitText` as globals (their
   demo loads them as globals). The npm package supplies both — register
   once and publish before any effect module runs. Client-only: every
   caller lazy-imports. */
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

if (typeof window !== "undefined") {
  const w = window as unknown as { gsap?: typeof gsap; SplitText?: typeof SplitText };
  w.gsap = gsap;
  w.SplitText = SplitText;
}

export { gsap, SplitText };
