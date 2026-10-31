import { sunPortraitSvg, SUN_PORTRAIT_SIZE, type SunPortraitInput } from "@/lib/sun-portrait";
import { downloadSvgImage } from "@/lib/download-svg-image";

/** Export the body-clock portrait — the shareable face of the trip. Rides
 *  the same SVG→canvas pipeline as the passport (round 25). */
export async function downloadSunPortrait(
  input: SunPortraitInput,
  format: "png" | "svg",
): Promise<void> {
  const slug =
    "meridian-portrait-" +
    input.routeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await downloadSvgImage(sunPortraitSvg(input), format, { ...SUN_PORTRAIT_SIZE, slug });
}
