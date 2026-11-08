/** Every key and database name the game uses starts with this (DESIGN §16.2: Pages origins are shared per account). */
export const STORAGE_PREFIX = "quiet-hours:";

export function storageKey(name: string): string {
  if (name.length === 0) throw new Error("storage key must not be empty");
  return name.startsWith(STORAGE_PREFIX) ? name : STORAGE_PREFIX + name;
}

/** localStorage wrapper that never throws (private windows, blocked site data) and always namespaces. */
export function safeStorage(backend: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined) {
  return {
    get(name: string): string | null {
      try {
        return backend?.getItem(storageKey(name)) ?? null;
      } catch {
        return null;
      }
    },
    set(name: string, value: string): boolean {
      try {
        backend?.setItem(storageKey(name), value);
        return backend !== undefined;
      } catch {
        return false;
      }
    },
    remove(name: string): void {
      try {
        backend?.removeItem(storageKey(name));
      } catch {
        /* ignore */
      }
    },
  };
}
