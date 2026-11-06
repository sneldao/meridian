/* The shared seam for stubbing globals in tests. Never plain assignment:
 * an earlier file may have left the name as a readonly configurable, and
 * `globalThis.x = …` throws on that in strict mode (that failure took CI
 * down once — order-dependent, because bun's readdir order decides which
 * file runs first). Restore puts the real descriptor back, or deletes the
 * stub outright when there wasn't one — never leave a readonly shape
 * behind for the next file to trip on. */

/** Stub `globalThis[name]` for the caller's lifetime; returns the restore. */
export function stubGlobal(name: string, value: unknown): () => void {
  const prev = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
  return () => {
    if (prev) Object.defineProperty(globalThis, name, prev);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

/** Stub `globalThis[name]` for the duration of `fn`. */
export function withStubbedGlobal<T>(
  name: string,
  value: unknown,
  fn: () => T,
): T {
  const restore = stubGlobal(name, value);
  try {
    return fn();
  } finally {
    restore();
  }
}
