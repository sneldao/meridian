import { dayCardSvg } from "@/lib/day-card-svg";
import type { PublicDayCard } from "@/lib/day-card";

export async function downloadDayCard(
  card: PublicDayCard,
  section: 0 | 1 | 2 | undefined,
  format: "png" | "svg",
): Promise<void> {
  const svg = dayCardSvg(card, section);
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    if (format === "svg") {
      trigger(svgUrl, "meridian-day-card.svg");
      return;
    }
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0, 1080, 1920);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png encode failed");
    const pngUrl = URL.createObjectURL(png);
    try {
      trigger(pngUrl, "meridian-day-card.png");
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
