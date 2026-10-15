// Where the sun is. One place, so the lens never re-derives it: the subsolar
// point (which the world lens turns into a geoCircle terminator) and the zenith
// angle (which tells you whether a place is in daylight at an instant).
//
// Closed forms only (NOAA / Spencer), no ephemeris table and no dependency.
// Declination is good to ~0.01° and the sun's longitude to ~1 km of ground —
// an order of magnitude tighter than Cooper's approximation plus "15° an hour",
// which is what the map used to carry. The equation of time is the difference
// that is easiest to see: it moves the sun (and so the ghost's headline gap) up
// to 4° of longitude, about 11 px on the lens.
//
// Sign conventions, since they are the classic source of bugs here:
//   · lon is degrees east in (−180, 180]
//   · lat is degrees north, +90 at the north pole
//   · declination > 0 means the sun is over the northern hemisphere

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SubsolarPoint {
  /** Longitude where the sun is overhead right now. */
  lon: number;
  /** Latitude where the sun is overhead (= solar declination). */
  lat: number;
}

/** Longitude wrapped to (−180, 180]. */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** NOAA's fraction-of-year angle, noon-referenced. */
function yearAngle(date: Date): number {
  const daysSinceJan1 = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return ((2 * Math.PI) / 365) * (Math.floor(daysSinceJan1) + (utcHours - 12) / 24);
}

/** Solar declination in degrees — how far the sub-solar point has moved off the equator. */
export function solarDeclination(date: Date): number {
  const g = yearAngle(date);
  const rad =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return rad * DEG;
}

/** Equation of time in minutes: apparent solar time minus mean solar time. */
export function equationOfTimeMin(date: Date): number {
  const g = yearAngle(date);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  );
}

/**
 * The one point on Earth with the sun directly overhead.
 *
 * Longitude is 15°/hour from noon UTC *minus* the equation of time: at its
 * extremes (early November, mid-February) apparent noon runs ±16 minutes off
 * mean noon, so "15 × (12 − UTC)" alone puts the sun 4° wide.
 */
export function subsolarPoint(date: Date): SubsolarPoint {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return {
    lon: wrapLon(15 * (12 - utcHours) - equationOfTimeMin(date) / 4),
    lat: solarDeclination(date),
  };
}

/** Angular distance of the sun from the zenith at a place: 90° is the terminator. */
export function solarZenithDeg(lat: number, lon: number, sub: SubsolarPoint): number {
  const cosZ =
    Math.sin(lat * RAD) * Math.sin(sub.lat * RAD) +
    Math.cos(lat * RAD) * Math.cos(sub.lat * RAD) * Math.cos((lon - sub.lon) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, cosZ))) * DEG;
}

/** Is this place lit right now? (The polar caps make this more than a clock.) */
export function isDaylight(lat: number, lon: number, date: Date): boolean {
  return solarZenithDeg(lat, lon, subsolarPoint(date)) < 90;
}

/**
 * Latitude of the day/night line at `lon` — the closed form behind the circle
 * the lens draws, kept so the curve can be reasoned about (and asserted on)
 * without a projection.
 *
 * cos(zenith) = 0 gives tan(φ) = −cos H / tan δ, H being the hour angle from
 * the sub-solar meridian. Two edges are explicit because they are exactly where
 * the naive expression goes to NaN:
 *   · |cos H| = 0 — the line crosses the equator 90° from the sun;
 *   · tan δ = 0 — around the equinoxes the line is a meridian pair, and the
 *     only honest answer is a pole, which is also what makes the polar day/night
 *     caps fall out of the same expression as everything else.
 */
export function terminatorLat(lon: number, sub: SubsolarPoint): number {
  const h = wrapLon(lon - sub.lon) * RAD;
  const cosH = Math.cos(h);
  const tanDec = Math.tan(sub.lat * RAD);
  if (Math.abs(cosH) < 1e-9) return 0;
  if (Math.abs(tanDec) < 1e-12) return cosH > 0 ? -90 : 90;
  return Math.atan(-cosH / tanDec) * DEG;
}
