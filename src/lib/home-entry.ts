import { isKnownCity } from "@/domain/fixtures";

export interface HomeRoute {
  origin: string;
  dest: string;
  date: string;
}

export type HomeEntryMode = "setup" | "trip" | "example";

export interface HomeEntry {
  mode: HomeEntryMode;

  route: HomeRoute | null;

  clockOpen: boolean;
}

function isRealDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === v;
}

export function isValidHomeRoute(v: unknown): v is HomeRoute {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.origin !== "string" || typeof r.dest !== "string" || typeof r.date !== "string") {
    return false;
  }
  const origin = r.origin.toUpperCase();
  const dest = r.dest.toUpperCase();
  if (!isKnownCity(origin) || !isKnownCity(dest) || origin === dest) return false;
  return isRealDate(r.date);
}

export function readHomeRoute(raw: string | null): HomeRoute | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidHomeRoute(parsed)) return null;
    return {
      origin: parsed.origin.toUpperCase(),
      dest: parsed.dest.toUpperCase(),
      date: parsed.date,
    };
  } catch {
    return null;
  }
}

export function routeFromTrip(raw: string | null): HomeRoute | null {
  if (!raw) return null;
  try {
    const trip = JSON.parse(raw);
    const origin = trip?.origin?.code;
    const dest = trip?.destination?.code;
    const depDay = Array.isArray(trip?.days)
      ? trip.days.find((d: { dayIndex?: number }) => d.dayIndex === trip.departureDayIndex)
      : null;
    const candidate = { origin, dest, date: depDay?.date };
    if (!isValidHomeRoute(candidate)) return null;
    return { origin: origin.toUpperCase(), dest: dest.toUpperCase(), date: depDay.date };
  } catch {
    return null;
  }
}

export function resolveHomeEntry(
  search: URLSearchParams,
  activeRaw: string | null,
  lastTripRaw: string | null,
): HomeEntry {
  const clockOpen = search.get("view") === "clock";
  if (search.get("example") === "1") {
    return { mode: "example", route: null, clockOpen };
  }
  const hasExplicit =
    search.get("origin") !== null || search.get("dest") !== null || search.get("date") !== null;
  if (hasExplicit) {
    const candidate = {
      origin: search.get("origin") ?? "",
      dest: search.get("dest") ?? "",
      date: search.get("date") ?? "",
    };
    if (!isValidHomeRoute(candidate)) return { mode: "setup", route: null, clockOpen };
    return {
      mode: "trip",
      route: { origin: candidate.origin.toUpperCase(), dest: candidate.dest.toUpperCase(), date: candidate.date },
      clockOpen,
    };
  }
  const active = readHomeRoute(activeRaw);
  if (active) return { mode: "trip", route: active, clockOpen };
  const legacy = routeFromTrip(lastTripRaw);
  if (legacy) return { mode: "trip", route: legacy, clockOpen };
  return { mode: "setup", route: null, clockOpen };
}
