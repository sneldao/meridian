const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export type ErrorSource = "server" | "client" | "crew";

export function errorDigest(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : undefined;
}

export function reportError(input: {
  source: ErrorSource;
  method?: string;
  routePath?: string;
  digest?: string;
}) {
  const record = {
    event: "meridian.request_error",
    time: new Date().toISOString(),
    source: input.source,
    method: input.method && METHODS.has(input.method) ? input.method : "UNKNOWN",
    route:
      input.routePath && /^\/[\/\w\-\[\]:.*]*$/.test(input.routePath.split("?")[0])
        ? input.routePath.split("?")[0]
        : "UNKNOWN",
    ...(errorDigest(input.digest) ? { digest: errorDigest(input.digest) } : {}),
  };
  console.error(JSON.stringify(record));
}
