// X falls back to og:image when no twitter card is set, but an explicit
// twitter-image guarantees the large-card render instead of the small one.
// Segment config fields must be literal exports — they can't be re-exported.
import Image from "./opengraph-image";

export const alt = "Meridian — body-clock passport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export default Image;
