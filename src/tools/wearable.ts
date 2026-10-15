import { ADHERENCE_PROFILE, GARMIN_BASELINE } from "@/domain/fixtures";
import type { AdherenceProfile, WearableBaseline } from "@/domain/types";

// Fixture-backed Garmin feed. Same shape the Terra/Garmin pipeline in the
// Orbura repo produces, so the merge path is a wiring change not a port.

export function getWearableBaseline(): WearableBaseline {
  return GARMIN_BASELINE;
}

export function getRecentNights(n = 5) {
  return GARMIN_BASELINE.nights.slice(-n);
}

export function getAdherenceProfile(): AdherenceProfile {
  return ADHERENCE_PROFILE;
}
