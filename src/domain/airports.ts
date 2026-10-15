// ~1,100 scheduled large airports with IANA zones (OurAirports, public domain,
// joined with mwgg/Airports for tz). Regenerate: see docs/hackathon-plan.md §2.

import raw from "@/data/airports.json";
import type { City } from "./types";
import { utcOffsetMinOn } from "./timezones";

export interface Airport {
  code: string; // IATA
  name: string; // city / municipality
  airport: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  tz: string; // IANA
}

export const AIRPORTS = raw as Airport[];
const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

export function findAirport(code: string | null | undefined): Airport | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined;
}

/** Type-ahead: exact code > code prefix > city prefix > word match in city/airport. */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of AIRPORTS) {
    const code = a.code.toLowerCase();
    const city = a.name.toLowerCase();
    const name = a.airport.toLowerCase();
    let s = 0;
    if (code === q) s = 100;
    else if (city === q) s = 90;
    else if (code.startsWith(q)) s = 70;
    else if (city.startsWith(q)) s = 60;
    else if (city.includes(` ${q}`) || name.includes(` ${q}`) || name.startsWith(q)) s = 40;
    else if (q.length >= 3 && (city.includes(q) || name.includes(q))) s = 20;
    if (s) scored.push({ a, s });
  }
  return scored
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}

/** A City for the domain model, with its UTC offset evaluated on `isoDate`. */
export function cityOn(code: string, isoDate: string): City {
  const a = findAirport(code);
  if (!a) throw new Error(`unknown airport ${code}`);
  return {
    code: a.code,
    name: a.name,
    airport: a.airport,
    country: a.country,
    tz: a.tz,
    utcOffsetMin: utcOffsetMinOn(a.tz, isoDate),
    lat: a.lat,
    lon: a.lon,
  };
}
