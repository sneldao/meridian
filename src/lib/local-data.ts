export function meridianStorageKeys(
  storage: Pick<Storage, "length" | "key">,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith("meridian:")) out.push(k);
  }
  return out;
}

export function safeStorageGet(read: () => string | null): string | null {
  try {
    return read();
  } catch (err) {
    if (typeof console !== "undefined") console.warn("meridian: storage read blocked", err);
    return null;
  }
}

export function safeStorageSet(write: () => void, label = "write"): boolean {
  try {
    write();
    return true;
  } catch (err) {
    if (typeof console !== "undefined") console.warn(`meridian: storage ${label} blocked`, err);
    return false;
  }
}
