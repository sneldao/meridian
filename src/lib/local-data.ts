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
  } catch {
    return null;
  }
}
