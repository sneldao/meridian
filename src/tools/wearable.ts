import { ADHERENCE_PROFILE, GARMIN_BASELINE } from "@/domain/fixtures";
import type { AdherenceProfile, WearableBaseline } from "@/domain/types";

// Fixture-backed Garmin feed. Same shape a production wearable pipeline
// produces, so swapping to live data is a wiring change not a port.

export function getWearableBaseline(): WearableBaseline {
  return GARMIN_BASELINE;
}

export function getRecentNights(n = 5) {
  return GARMIN_BASELINE.nights.slice(-n);
}

export function getAdherenceProfile(): AdherenceProfile {
  return ADHERENCE_PROFILE;
}
