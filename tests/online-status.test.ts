import { describe, expect, test } from "bun:test";
import { useOnlineStatus } from "@/lib/use-online-status";

describe("useOnlineStatus", () => {
  test("is a callable hook", () => {
    expect(typeof useOnlineStatus).toBe("function");
  });
});
