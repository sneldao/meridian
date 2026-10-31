/* One export pipeline for every artifact that leaves the app (round 25):
 * SVG string → <img> → canvas → PNG (or the raw SVG). The day card, the
 * arrival passport and the body-clock portrait all ride the same rails, so
 * a fix to the pipeline fixes every shareable at once. */

export interface DownloadSvgImageOptions {
  width: number;
  height: number;
  /** File name without extension — `.png` / `.svg` is appended. */
  slug: string;
}

export async function downloadSvgImage(
  svg: string,
  format: "png" | "svg",
  { width, height, slug }: DownloadSvgImageOptions,
): Promise<void> {
  if (format === "svg") {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      trigger(url, `${slug}.svg`);
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
      trigger(pngUrl, `${slug}.png`);
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
