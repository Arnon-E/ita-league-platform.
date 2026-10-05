import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;
let token: string | null = null;

export async function loadToken() { token = await SecureStore.getItemAsync('ita_token'); return token; }
export async function logout() { token = null; await SecureStore.deleteItemAsync('ita_token'); }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export async function login(email: string, password: string) {
  const r = await call<{ token: string; user: { name: string; role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  token = r.token; await SecureStore.setItemAsync('ita_token', r.token);
  return r.user;
}

export type Match = { id: string; categoryId: string; stage: string; round: number; status: string; a: { id: string | null; name: string | null }; b: { id: string | null; name: string | null }; court: string | null; start: string | null };
export const tournaments = () => call<{ id: string; name: string; status: string }[]>('/tournaments');
export const tournament = (id: string) => call<{ tournament: { name: string }; matches: Match[] }>(`/tournaments/${id}`);
export const me = () => call<{ players: { id: string; name: string; documents: { ok: boolean; missing: string[] } }[]; entries: { id: string; tournament: string; category: string; status: string; payment: string }[]; notifications: { id: string; title: string; body: string }[] }>('/me');
export const sendResult = (matchId: string, body: unknown) => call(`/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify(body) });
export const registerDevice = (pushToken: string, platform: 'ios' | 'android') => call('/devices', { method: 'POST', body: JSON.stringify({ token: pushToken, platform }) });

export const openCategories = () => call<{ categoryId: string; category: string; tournament: string; feeAgorot: number }[]>('/entries');
export const enter = (categoryId: string, playerId: string) => call('/entries', { method: 'POST', body: JSON.stringify({ categoryId, playerId }) });
export const checkout = (entryId: string) => call<{ url: string }>('/checkout', { method: 'POST', body: JSON.stringify({ entryId }) });

/** Uploads a photo/PDF from the device. The server checks the real file type, size and ownership. */
export async function uploadDocument(playerId: string, type: string, file: { uri: string; name: string; mime: string }) {
  const fd = new FormData();
  fd.append('player', playerId); fd.append('type', type);
  fd.append('file', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
  const res = await fetch(`${BASE}/api/v1/documents`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
