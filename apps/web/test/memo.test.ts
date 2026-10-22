import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memo, memoClear } from '@/lib/memo';

beforeEach(() => { vi.stubEnv('MEMO_TEST', '1'); memoClear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

/** Behaves like a Drizzle query: nothing happens until awaited, and it runs again for every await. */
function lazyQuery<T>(value: T, runs: { n: number }): PromiseLike<T> {
  return { then: (ok, bad) => { runs.n++; return Promise.resolve(value).then(ok, bad); } } as PromiseLike<T>;
}

describe('memo', () => {
  it('runs a lazy query once for many visitors, even when they all await the same result', async () => {
    const runs = { n: 0 };
    const get = () => memo('k1', 60_000, () => lazyQuery([1, 2, 3], runs));
    expect(await get()).toEqual([1, 2, 3]);
    expect(await get()).toEqual([1, 2, 3]);
    await Promise.all([get(), get(), get()]);
    expect(runs.n).toBe(1);
  });

  it('shares a plain async function the same way, and asks again once the time is up', async () => {
    vi.useFakeTimers();
    let n = 0;
    const get = () => memo('k2', 1000, async () => ++n);
    expect(await get()).toBe(1);
    expect(await get()).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(await get()).toBe(2);
  });

  it('does not keep a failure', async () => {
    let n = 0;
    const get = () => memo('k3', 60_000, async () => { if (++n === 1) throw new Error('db down'); return 'ok'; });
    await expect(get()).rejects.toThrow('db down');
    await new Promise((r) => setTimeout(r, 0));
    expect(await get()).toBe('ok');
  });
});
