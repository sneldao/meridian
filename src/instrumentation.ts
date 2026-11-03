import type { Instrumentation } from "next";
import { errorDigest, reportError } from "@/lib/error-reporting";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  reportError({
    source: "server",
    method: request.method,
    routePath: context.routePath,
    digest:
      error && typeof error === "object"
        ? errorDigest((error as { digest?: unknown }).digest)
        : undefined,
  });
};
