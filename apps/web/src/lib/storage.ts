import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Private object storage. Files are never served from a public path: access is through a short-lived signed URL.
 * Local-disk implementation for development; production swaps in S3/GCS with the same interface.
 */
const ROOT = () => process.env.STORAGE_DIR ?? path.resolve(process.cwd(), '.storage');
const SECRET = () => process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-32bytes!!';

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_BYTES = 8 * 1024 * 1024;

export function sniff(buf: Uint8Array): string | null {
  const b = Buffer.from(buf.slice(0, 8));
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (b.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  return null;
}

const safe = (key: string) => {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('Bad storage key');
  return path.join(ROOT(), key);
};

export async function putObject(prefix: string, data: Uint8Array): Promise<string> {
  const key = `${prefix}/${randomUUID()}`;
  const file = safe(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(safe(key));
}

const sig = (key: string, exp: number) => createHmac('sha256', SECRET()).update(`${key}.${exp}`).digest('hex');

export function signedUrl(key: string, ttlSec = 300, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSec;
  return `/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig(key, exp)}`;
}

export function verifySigned(key: string, exp: number, s: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const a = Buffer.from(sig(key, exp));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}
