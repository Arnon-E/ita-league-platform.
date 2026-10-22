const store = new Map<string, { at: number; p: Promise<unknown> }>();

/**
 * Shares one result between everyone who asks within `ttlMs`, per server instance. For data that changes slowly (tournament lists,
 * rankings, club lists) this keeps repeat visits off the database, which bills by the data it sends. Off under tests so they see fresh rows.
 *
 * `fn` may return a Drizzle query: those are lazy thenables that run again on every `await`, so the result is turned into one real promise
 * here (storing the query itself would re-run it for every visitor, which is exactly what this is meant to avoid).
 */
export function memo<T>(key: string, ttlMs: number, fn: () => PromiseLike<T> | Promise<T>): Promise<T> {
  if (process.env.VITEST && !process.env.MEMO_TEST) return Promise.resolve().then(fn);
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = Promise.resolve().then(fn);
  store.set(key, { at: Date.now(), p });
  p.catch(() => { if (store.get(key)?.p === p) store.delete(key); });
  return p;
}

/** Test helper: forget everything cached. */
export function memoClear() { store.clear(); }
