import type { DestinationPlace, TasteMarks } from "@/domain/taste";

/* Local-first taste memory: kept/dismissed verdicts land here the moment
 * they happen — the same-device compound loop needs no graph at all.
 * /api/taste/feedback is the cross-device layer on top; this is the floor
 * every user gets. Latest verdict per place wins. */

const KEY = "meridian:taste-signals";
const MAX_SIGNALS = 50;

interface StoredSignal {
  status: "kept" | "dismissed";
  id?: string;
  name: string;
  at: number;
}

const signalKey = (id: string | undefined, name: string) => id ?? name.trim().toLowerCase();

function isSignal(v: unknown): v is StoredSignal {
  if (!v || typeof v !== "object") return false;
  const o = v as { status?: unknown; id?: unknown; name?: unknown; at?: unknown };
  return (
    (o.status === "kept" || o.status === "dismissed") &&
    typeof o.name === "string" &&
    o.name.trim().length > 0 &&
    o.name.length <= 300 &&
    (o.id === undefined || (typeof o.id === "string" && o.id.length > 0 && o.id.length <= 64)) &&
    typeof o.at === "number" &&
    Number.isFinite(o.at)
  );
}

export function readTasteSignals(storage: Pick<Storage, "getItem">): TasteMarks {
  const out: TasteMarks = { kept: [], dismissed: [] };
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > 64_000) return out;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (!isSignal(v)) continue;
      if (v.status === "kept") {
        if (v.id) out.kept.push(v.id);
      } else {
        out.dismissed.push({ ...(v.id ? { id: v.id } : {}), name: v.name });
      }
    }
    return out;
  } catch {
    return out;
  }
}

export function recordTasteSignal(
  storage: Pick<Storage, "getItem"> & Pick<Storage, "setItem">,
  status: "kept" | "swapped" | "dismissed",
  place: DestinationPlace,
): void {
  try {
    const raw = storage.getItem(KEY);
    const map: Record<string, StoredSignal> = {};
    if (raw && raw.length <= 64_000) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (isSignal(v)) map[k] = v;
        }
      }
    }
    map[signalKey(place.id, place.name)] = {
      status: status === "dismissed" ? "dismissed" : "kept",
      ...(place.id ? { id: place.id } : {}),
      name: place.name.slice(0, 300),
      at: Date.now(),
    };
    const entries = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_SIGNALS);
    storage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage blocked — the posted edge is the memory that counts */
  }
}
