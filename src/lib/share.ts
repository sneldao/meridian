import { readFileSync, existsSync } from "fs";
import path from "path";

/** Read a shared plan card payload written by POST /api/share. */
export function loadSharedPlan(id: string) {
  const p = path.join(process.cwd(), "artifacts", "share", `${id}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
