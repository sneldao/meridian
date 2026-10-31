import { arrivalPassportSvg, ARRIVAL_PASSPORT_SIZE } from "@/lib/arrival-passport-svg";
import { downloadSvgImage } from "@/lib/download-svg-image";
import type { ArrivalPassport } from "@/domain/arrival-passport";
import type { SunSelfRead } from "@/domain/sun-self";

/** Export the arrival passport as a downloaded image — rides the shared
 *  SVG→canvas pipeline (round 25). */
export async function downloadArrivalPassport(
  pp: ArrivalPassport,
  format: "png" | "svg",
  sun?: SunSelfRead,
): Promise<void> {
  const slug =
    "meridian-arrival-" +
    pp.route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await downloadSvgImage(arrivalPassportSvg(pp, sun), format, {
    ...ARRIVAL_PASSPORT_SIZE,
    slug,
  });
}
