import { createHash } from "node:crypto";
import { sessionTokenOf } from "./session";

export function tenantForToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 48);
}

export function tenantOf(req: Request): string | undefined {
  const token = sessionTokenOf(req);
  return token ? tenantForToken(token) : undefined;
}
