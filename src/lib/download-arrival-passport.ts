import { arrivalPassportSvg, ARRIVAL_PASSPORT_SIZE } from "@/lib/arrival-passport-svg";
import type { ArrivalPassport } from "@/domain/arrival-passport";
import type { SunSelfRead } from "@/domain/sun-self";

/** Export the arrival passport as a downloaded image — the same SVG→canvas
 *  pipeline the day card uses. */
export async function downloadArrivalPassport(
  pp: ArrivalPassport,
  format: "png" | "svg",
  sun?: SunSelfRead,
): Promise<void> {
  const svg = arrivalPassportSvg(pp, sun);
  const { width, height } = ARRIVAL_PASSPORT_SIZE;
  const slug = pp.route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (format === "svg") {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      trigger(url, `meridian-arrival-${slug}.svg`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png encode failed");
    const pngUrl = URL.createObjectURL(png);
    try {
      trigger(pngUrl, `meridian-arrival-${slug}.png`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
  }
}

function trigger(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
