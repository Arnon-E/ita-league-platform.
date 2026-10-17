import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;
let token: string | null = null;

let role: string | null = null;
let userName: string | null = null;
export async function loadToken() { token = await SecureStore.getItemAsync('ita_token'); role = await SecureStore.getItemAsync('ita_role'); userName = await SecureStore.getItemAsync('ita_name'); return token; }
export async function logout() { token = null; role = null; userName = null; await SecureStore.deleteItemAsync('ita_token'); await SecureStore.deleteItemAsync('ita_role'); await SecureStore.deleteItemAsync('ita_name'); }
/** Name of the signed-in user, shown in the app header. */
export const currentUserName = () => userName;
export async function rememberUserName(name: string) { userName = name; await SecureStore.setItemAsync('ita_name', name); }
export const isAuthed = () => !!token;
/** Ends every session of this account on every device (including this one), then clears the local one. */
export async function logoutAll() { await call('/auth/logout-all', { method: 'POST' }); await logout(); }
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

/** remember: keep the session on the phone (30 days) so the app opens signed in. Off: it lives in memory only and ends with the app. */
export async function login(email: string, password: string, remember = true) {
  const r = await call<{ token: string; user: { name: string; role: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, remember }) });
  token = r.token; role = r.user.role; userName = r.user.name; if (remember) await SecureStore.setItemAsync('ita_name', r.user.name); if (remember) { await SecureStore.setItemAsync('ita_token', r.token); await SecureStore.setItemAsync('ita_role', r.user.role); } else { await SecureStore.deleteItemAsync('ita_token'); await SecureStore.deleteItemAsync('ita_role'); }
  return r.user;
}

export async function register(name: string, email: string, phone: string, password: string, remember = true) {
  const r = await call<{ token: string; user: { name: string; role: string } }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password, remember }) });
  token = r.token; role = r.user.role; userName = r.user.name; if (remember) { await SecureStore.setItemAsync('ita_token', r.token); await SecureStore.setItemAsync('ita_role', r.user.role); await SecureStore.setItemAsync('ita_name', r.user.name); } else { await SecureStore.deleteItemAsync('ita_token'); await SecureStore.deleteItemAsync('ita_role'); }
  return r.user;
}
export const updatePlayer = (id: string, p: { first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE' }) => call<{ ok: true }>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
export const removePlayer = (id: string) => call<{ deleted: boolean }>(`/players/${id}`, { method: 'DELETE' });
export const addPlayer = (p: { first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE'; forChild: boolean }) => call<{ id: string }>('/players', { method: 'POST', body: JSON.stringify(p) });

export type Match = { id: string; categoryId: string; stage: string; round: number; status: string; a: { id: string | null; name: string | null }; b: { id: string | null; name: string | null }; court: string | null; start: string | null; sets: { a: number; b: number }[]; winnerEntryId?: string | null };
export const tournaments = () => call<{ id: string; name: string; status: string; level: string; section: string; startDate: string; endDate: string; registrationCloses: string | null }[]>('/tournaments');
export type Cat = { id: string; name: string; gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear: number | null; maxBirthYear: number | null };
export const tournament = (id: string) => call<{ tournament: { name: string; status: string; startDate: string; endDate: string; registrationCloses: string | null; registerUrl: string | null }; categories: Cat[]; matches: Match[] }>(`/tournaments/${id}`);
export const me = () => call<{ name: string; isChild: boolean; players: { id: string; name: string; first: string; last: string; birth: string; synced: boolean; gender: 'MALE' | 'FEMALE'; birthYear: number; own: boolean; childLogin: string | null; documents: { ok: boolean; missing: string[] } }[]; entries: { id: string; playerId: string; player: string; tournament: string; category: string; status: string; payment: string }[]; notifications: { id: string; title: string; body: string }[] }>('/me');
export const sendResult = (matchId: string, body: unknown) => call(`/matches/${matchId}/result`, { method: 'POST', body: JSON.stringify(body) });
export const registerDevice = (pushToken: string, platform: 'ios' | 'android') => call('/devices', { method: 'POST', body: JSON.stringify({ token: pushToken, platform }) });

export const openCategories = () => call<{ categoryId: string; category: string; gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear: number | null; maxBirthYear: number | null; tournament: string; feeAgorot: number }[]>('/entries');
export const cancelEntry = (entryId: string) => call<{ ok: true }>(`/entries/${entryId}`, { method: 'DELETE' });
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

export type FeedRow = { id: string; tournament: string; category: string; status: string; a: string | null; b: string | null; sets: { a: number; b: number }[]; court: string | null; start: string | null; winner?: 'a' | 'b' | null };
export const follows = () => call<{ kind: string; target: string }[]>('/follows');
export const toggleFollow = (kind: 'PLAYER' | 'CLUB' | 'TOURNAMENT', target: string) => call<{ following: boolean }>('/follows', { method: 'POST', body: JSON.stringify({ kind, target }) });
export const gallery = (tournamentId: string) => call<{ id: string; caption: string | null }[]>(`/tournaments/${tournamentId}/gallery`);
export const photoUrl = (photoId: string) => `${BASE}/api/gallery/${photoId}`;
export const live = () => call<{ live: FeedRow[]; upcoming: FeedRow[]; results: FeedRow[] }>('/public/live');
export const sendLive = (matchId: string, sets: { a: number; b: number; superTb?: boolean }[]) => call(`/matches/${matchId}/live`, { method: 'POST', body: JSON.stringify({ sets }) });
export const rankings = (g: 'MALE' | 'FEMALE', age?: number) => call<{ playerId: string; rank: number; points: number; name: string; club: string | null }[]>(`/public/rankings?g=${g}${age ? `&age=${age}` : ''}`);
export const players = (q: string, offset = 0, limit = 50) => call<{ id: string; name: string; club: string | null; birthYear?: number }[]>(`/public/players?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`);

export type LeagueRow = { id: string; name: string; gender: string; teams: number; played: number; total: number };
export type LeagueDetail = {
  id: string; name: string; updatedAt: string;
  groups: { name: string; standings: { rank: number; team: string; played: number; points: number; wins: number; losses: number; setsFor: number; setsAgainst: number }[] }[];
  rounds: { name: string; matches: { done: boolean; start: string | null; group: string; home: { team: string }; away: { team: string }; homeScore: number | null; awayScore: number | null; venue: string;
    rubbers?: { n: number; home: string[]; away: string[]; sets: { h: number; g: number }[]; winner: 'home' | 'away' | null }[] }[] }[];
};
export type About = {
  union: { description?: string; about?: string; regulation?: string; statement?: string };
  events: { title: string; place: string; start: string; end: string; description: string; url: string }[];
  forms: { id: number; name: string; description: string; url: string }[];
  sponsors: { id: number; url: string }[];
};
export const about = () => call<About>('/public/about');
export const leagues = () => call<LeagueRow[]>('/public/leagues');
export const league = (id: string) => call<LeagueDetail>(`/public/leagues/${id}`);
export const regulations = () => call<{ id: string; title: string; url: string; category: string }[]>('/public/regulations');
export const clubs = () => call<{ id: string; name: string; city: string | null; players: number }[]>('/public/clubs');
export const stats = () => call<{ totals: { tournaments: number; players: number; matches: number }; top: { id: string; name: string; club: string | null; played: number; wins: number }[]; clubs: { id: string; name: string; players: number }[] }>('/public/stats');

export type HomeMatch = { id: string; tournament: string; category: string; status: string; opponent: string | null; start: string | null; court: string | null; won: boolean | null; sets: { a: number; b: number }[] };
export type HomePerson = {
  id: string; name: string; relation: 'SELF' | 'CHILD'; childLogin: string | null; age: number; club: string | null; rank: number | null; points: number; wins: number; losses: number; form: boolean[];
  nextMatch: HomeMatch | null; recent: HomeMatch[]; nextTournament: { id: string; name: string; start: string; category: string; status: string; payment: string } | null;
  docsOk: boolean; missingDocs: string[]; todo: string[];
  canRegister: { tournamentId: string; tournament: string; categoryId: string; category: string; closes: string | null }[];
};
export type HomeWork = {
  kind: 'ADMIN' | 'TOURNAMENT_MANAGER' | 'REFEREE' | 'CLUB';
  admin: { pendingDocs: number; pendingClaims: number; openRegistration: number; inProgress: number } | null;
  tournaments: { id: string; name: string; status: string; start: string; end: string; waiting: number; upcoming: number }[];
  club: { id: string; name: string; players: number; upcomingEntries: number; top: { id: string; name: string; rank: number; points: number }[] } | null;
};
export const myHome = () => call<{ role: 'NONE' | 'PLAYER' | 'PARENT' | 'BOTH'; isChild: boolean; people: HomePerson[]; work: HomeWork | null }>('/me/home');
export const setChildLogin = (playerId: string, username: string, password: string) => call<{ username: string }>('/children/login', { method: 'POST', body: JSON.stringify({ playerId, username, password }) });
export const suggestEntry = (categoryId: string) => call<{ ok: true }>('/entries/suggest', { method: 'POST', body: JSON.stringify({ categoryId }) });

export type FollowOverview = {
  players: { id: string; name: string; club: string | null; rank: number | null; points: number; recent: { won: boolean; vs: string; score: string; competition: string }[]; next: { vs: string; competition: string; when: string | null; court: string | null } | null }[];
  clubs: { id: string; name: string }[];
  tournaments: { id: string; name: string; status: string; startDate: string; endDate: string }[];
};
export const followOverview = () => call<FollowOverview>('/follows/overview');
