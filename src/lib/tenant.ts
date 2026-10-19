// Per-traveller identity. The middleware stamps a `meridian-tid` cookie on
// first contact and mirrors it into `x-meridian-tid` on API requests, so a
// traveller id is just a header read — callers never touch localStorage.
// `?tenant=` remains the explicit override (demos, seeded fixtures, MCP).

const HEADER = "x-meridian-tid";

/** The tenant for this request: explicit ?tenant= wins, else the
 *  middleware-stamped visitor cookie header, else undefined (demo/global). */
export function tenantOf(req: Request): string | undefined {
  const q = new URL(req.url).searchParams.get("tenant");
  if (q) return q;
  return req.headers.get(HEADER) ?? undefined;
}
