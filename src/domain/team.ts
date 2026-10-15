import { buildTrip } from "./fixtures";
import type { CityCode, Trip } from "./types";

// The team roster: twelve travellers, each with their own route and their own
// crew. Shared by the team stream route and the team page so both agree on
// who is travelling where.

export interface Traveller {
  id: string;
  name: string;
  origin: CityCode;
  dest: CityCode;
}

export const TEAM_DEPARTURE = "2026-10-18";

export const TEAM_TRAVELLERS: Traveller[] = [
  { id: "t01", name: "Alex Rivera", origin: "LHR", dest: "HND" },
  { id: "t02", name: "Priya Shah", origin: "LHR", dest: "SIN" },
  { id: "t03", name: "Tom Okafor", origin: "JFK", dest: "HND" },
  { id: "t04", name: "Mei Lin", origin: "SFO", dest: "SIN" },
  { id: "t05", name: "Ben Hartley", origin: "LHR", dest: "JFK" },
  { id: "t06", name: "Sofia Mendes", origin: "CDG", dest: "HND" },
  { id: "t07", name: "Daniel Kim", origin: "SFO", dest: "HND" },
  { id: "t08", name: "Hannah Weiss", origin: "JFK", dest: "CDG" },
  { id: "t09", name: "Omar Haddad", origin: "CDG", dest: "SIN" },
  { id: "t10", name: "Grace Liu", origin: "LHR", dest: "SFO" },
  { id: "t11", name: "Lucas Moreau", origin: "JFK", dest: "SIN" },
  { id: "t12", name: "Isla Ross", origin: "SFO", dest: "CDG" },
];

export function teamTrip(t: Traveller): Trip {
  return buildTrip(t.origin, t.dest, TEAM_DEPARTURE);
}
