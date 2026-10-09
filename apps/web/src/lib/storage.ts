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

const useS3 = () => !!process.env.S3_BUCKET;
// Vercel Blob (private store): enabled when a Blob store is connected to the project.
const useBlob = () => !useS3() && !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
let s3: Promise<{ client: import('@aws-sdk/client-s3').S3Client; sdk: typeof import('@aws-sdk/client-s3') }> | null = null;
function s3Client() {
  s3 ??= import('@aws-sdk/client-s3').then((sdk) => ({
    sdk,
    client: new sdk.S3Client({
      region: process.env.S3_REGION ?? 'auto',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' } : undefined as never,
    }),
  }));
  return s3;
}

export async function putObject(prefix: string, data: Uint8Array): Promise<string> {
  const key = `${prefix}/${randomUUID()}`;
  if (useBlob()) {
    safe(key);
    const { put } = await import('@vercel/blob');
    await put(key, Buffer.from(data), { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    return key;
  }
  if (useS3()) {
    safe(key); // validates the key shape
    const { client, sdk } = await s3Client();
    await client.send(new sdk.PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: data }));
    return key;
  }
  const file = safe(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  if (useBlob()) {
    safe(key);
    const { get } = await import('@vercel/blob');
    const r = await get(key, { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error('File not found');
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  if (useS3()) {
    safe(key);
    const { client, sdk } = await s3Client();
    const out = await client.send(new sdk.GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
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
