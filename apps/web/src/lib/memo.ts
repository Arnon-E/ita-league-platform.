const store = new Map<string, { at: number; p: Promise<unknown> }>();

/**
 * Shares one result between everyone who asks within `ttlMs`, per server instance. For data that changes slowly (tournament lists,
 * rankings, club lists) this keeps repeat visits off the database, which bills by the data it sends. Off under tests so they see fresh rows.
 */
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (process.env.VITEST) return fn();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  store.set(key, { at: Date.now(), p });
  p.catch(() => { if (store.get(key)?.p === p) store.delete(key); });
  return p;
}
