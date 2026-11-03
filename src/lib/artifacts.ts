import path from "node:path";

const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
const NAMES = new Set(["shift-plan.json", "shift-log.json", "calendar-plan.ics"]);

export function artifactPath(name: string, tenant?: string): string {
  if (!NAMES.has(name)) throw new Error(`unknown artifact: ${name}`);
  const safe = tenant?.replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
  if (!safe) return path.join(ARTIFACTS_DIR, name);
  const dot = name.lastIndexOf(".");
  return path.join(ARTIFACTS_DIR, `${name.slice(0, dot)}-${safe}${name.slice(dot)}`);
}
