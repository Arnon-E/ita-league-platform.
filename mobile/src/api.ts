import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;
let token: string | null = null;

let role: string | null = null;
export async function loadToken() { token = await SecureStore.getItemAsync('ita_token'); role = await SecureStore.getItemAsync('ita_role'); return token; }
export async function logout() { token = null; role = null; await SecureStore.deleteItemAsync('ita_token'); await SecureStore.deleteItemAsync('ita_role'); }
export const isAuthed = () => !!token;
/** Called when the server says our session is no longer valid (expired after 12h), so the UI can go back to the login screen. */
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: (() => void) | null) => { onAuthLost = fn; };
/** Roles allowed to enter results (the server enforces this too). */
export const canScore = () => ['SUPER_ADMIN', 'FEDERATION_ADMIN', 'TOURNAMENT_MANAGER', 'REFEREE'].includes(role ?? '');

/** Server errors are mostly Hebrew already; map the few machine codes to something a person can read. */
function heMessage(err: string | undefined, status: number): string {
  if (err === 'forbidden') return 'אין לך הרשאה לפעולה הזו. שופט יכול לעדכן רק משחקים בתחרות שאליה שובץ.';
  if (err === 'unauthorized') return 'יש להתחבר מחדש.';
  return err ?? `שגיאה (${status})`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { await logout(); onAuthLost?.(); }
  if (!res.ok) throw new Error(heMessage(body.error, res.status));
  return body as T;
}

export async function login(email: string, password: string) {
  const r = await call<{ token: string; user: { name: string; role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  token = r.token; role = r.user.role; await SecureStore.setItemAsync('ita_token', r.token); await SecureStore.setItemAsync('ita_role', r.user.role);
  return r.user;
}

export async function register(name: string, email: string, phone: string, password: string) {
  const r = await call<{ token: string; user: { name: string; role: string } }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
  token = r.token; role = r.user.role; await SecureStore.setItemAsync('ita_token', r.token); await SecureStore.setItemAsync('ita_role', r.user.role);
  return r.user;
}
export const addPlayer = (p: { first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE'; forChild: boolean }) => call<{ id: string }>('/players', { method: 'POST', body: JSON.stringify(p) });

export type Match = { id: string; categoryId: string; stage: string; round: number; status: string; a: { id: string | null; name: string | null }; b: { id: string | null; name: string | null }; court: string | null; start: string | null; sets: { a: number; b: number }[] };
export const tournaments = () => call<{ id: string; name: string; status: string; level: string; startDate: string }[]>('/tournaments');
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

export type FeedRow = { id: string; tournament: string; category: string; status: string; a: string | null; b: string | null; sets: { a: number; b: number }[]; court: string | null; start: string | null };
export const follows = () => call<{ kind: string; target: string }[]>('/follows');
export const toggleFollow = (kind: 'PLAYER' | 'CLUB' | 'TOURNAMENT', target: string) => call<{ following: boolean }>('/follows', { method: 'POST', body: JSON.stringify({ kind, target }) });
export const gallery = (tournamentId: string) => call<{ id: string; caption: string | null }[]>(`/tournaments/${tournamentId}/gallery`);
export const photoUrl = (photoId: string) => `${BASE}/api/gallery/${photoId}`;
export const live = () => call<{ live: FeedRow[]; upcoming: FeedRow[]; results: FeedRow[] }>('/public/live');
export const sendLive = (matchId: string, sets: { a: number; b: number; superTb?: boolean }[]) => call(`/matches/${matchId}/live`, { method: 'POST', body: JSON.stringify({ sets }) });
export const rankings = (g: 'MALE' | 'FEMALE', age?: number) => call<{ playerId: string; rank: number; points: number; name: string; club: string | null }[]>(`/public/rankings?g=${g}${age ? `&age=${age}` : ''}`);
export const players = (q: string) => call<{ id: string; name: string; club: string | null }[]>(`/public/players?q=${encodeURIComponent(q)}`);
