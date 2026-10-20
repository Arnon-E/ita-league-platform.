import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { tr } from './i18n';

const BASE = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;
let token: string | null = null;

let role: string | null = null;
let userName: string | null = null;
export async function loadToken() { token = await SecureStore.getItemAsync('ita_token'); role = await SecureStore.getItemAsync('ita_role'); userName = await SecureStore.getItemAsync('ita_name'); return token; }
export async function logout() { cache.clear(); adminReturn = null; token = null; role = null; userName = null; await SecureStore.deleteItemAsync('ita_token'); await SecureStore.deleteItemAsync('ita_role'); await SecureStore.deleteItemAsync('ita_name'); }
/** Name of the signed-in user, shown in the app header. */
export const currentUserName = () => userName;
export const currentRole = () => role;
/** Super admin acting as another user: the admin's own session is kept in memory (never stored) so "back" restores it. */
let adminReturn: { token: string | null; role: string | null; name: string | null } | null = null;
export const isImpersonating = () => !!adminReturn;
export async function impersonate(id: string) {
  const r = await call<{ token: string; name: string; role: string }>('/admin/impersonate', { method: 'POST', body: JSON.stringify({ id }) });
  adminReturn = { token, role, name: userName };
  token = r.token; role = r.role; userName = r.name;
  return r;
}
export function stopImpersonating() {
  if (!adminReturn) return;
  token = adminReturn.token; role = adminReturn.role; userName = adminReturn.name; adminReturn = null;
}
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
  if (err === 'forbidden') return tr('אין לך הרשאה לפעולה הזו. שופט יכול לעדכן רק משחקים בתחרות שאליה שובץ.');
  if (err === 'unauthorized') return tr('יש להתחבר מחדש.');
  return err ?? tr('שגיאה ({status})', { status });
}

/** Public GETs are kept for a minute and shared while in flight, so tab switches and screens that ask for the same list are instant. Any write, sign-in or sign-out clears it. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
const cacheable = (path: string, init: RequestInit) => !init.method && /^\/(public|tournaments)(\/|\?|$)/.test(path);
export const clearCache = () => cache.clear();

function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (init.method && init.method !== 'GET') cache.clear();
  if (!cacheable(path, init)) return rawCall<T>(path, init);
  const key = `${token ? 1 : 0}${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p as Promise<T>;
  const p = rawCall<T>(path, init);
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

async function rawCall<T>(path: string, init: RequestInit = {}): Promise<T> {
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
export const addPlayer = (p: { first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE'; forChild: boolean; nationalId?: string }) => call<{ id: string; linkedExisting?: boolean; pending?: boolean }>('/players', { method: 'POST', body: JSON.stringify(p) });

export type Match = { id: string; categoryId: string; stage: string; round: number; index?: number; status: string; a: { id: string | null; name: string | null }; b: { id: string | null; name: string | null }; court: string | null; start: string | null; sets: { a: number; b: number }[]; winnerEntryId?: string | null };
export type TournamentRow = { id: string; name: string; status: string; level: string; section: string; startDate: string; endDate: string; registrationCloses: string | null; relevant?: boolean };
export const tournaments = () => call<TournamentRow[]>('/tournaments');
export type Cat = { id: string; name: string; gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear: number | null; maxBirthYear: number | null };
export type Participant = { categoryId: string; id: string; name: string; club: string | null; photo: string | null; fromLoglig: boolean };
export const tournament = (id: string) => call<{ tournament: { name: string; status: string; startDate: string; endDate: string; registrationCloses: string | null; registerUrl: string | null }; categories: Cat[]; matches: Match[]; participants?: Participant[] }>(`/tournaments/${id}`);
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
export const live = (u = 15, r = 15) => call<{ live: FeedRow[]; upcoming: FeedRow[]; results: FeedRow[]; moreUpcoming?: boolean; moreResults?: boolean }>(`/public/live?u=${u}&r=${r}`);
export const sendLive = (matchId: string, sets: { a: number; b: number; superTb?: boolean }[]) => call(`/matches/${matchId}/live`, { method: 'POST', body: JSON.stringify({ sets }) });
export const rankingCount = (g: 'MALE' | 'FEMALE', age?: number, club?: string) => call<{ total: number }>(`/public/rankings?g=${g}${age ? `&age=${age}` : ''}${club ? `&club=${club}` : ''}&count=1`);
export const rankings = (g: 'MALE' | 'FEMALE', age?: number, club?: string, offset = 0, limit = 50) => call<{ playerId: string; rank: number; points: number; name: string; club: string | null; counted?: number }[]>(`/public/rankings?g=${g}${age ? `&age=${age}` : ''}${club ? `&club=${club}` : ''}&offset=${offset}&limit=${limit}`);
export const webUrl = (path: string) => `${BASE}${path}`;
export type PlayerRow = { rank?: number | null; id: string; name: string; club: string | null; birthYear?: number; age?: number; gender?: 'MALE' | 'FEMALE'; photo?: string | null };
export const players = (q: string, offset = 0, limit = 50, f: { g?: 'MALE' | 'FEMALE'; age?: number; club?: string; all?: boolean } = {}) => call<PlayerRow[]>(`/public/players?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}${f.g ? `&g=${f.g}` : ''}${f.age ? `&age=${f.age}` : ''}${f.club ? `&club=${f.club}` : ''}${f.all ? '&show=all' : ''}`);

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
/** A latest result, singles or doubles (a pair per side), as the Loglig app shows it. */
export type HomeResult = { id: string; doubles: boolean; tournament: string; category: string; start: string | null; kind: string | null; status: string; a: string[]; b: string[]; sets: { a: number; b: number; superTb?: boolean }[]; winner: 'a' | 'b'; mine: 'a' | 'b' };
export type HomePerson = {
  id: string; name: string; relation: 'SELF' | 'CHILD'; gender: 'MALE' | 'FEMALE' | 'OPEN'; childLogin: string | null; age: number; club: string | null; rank: number | null; points: number; wins: number; losses: number; form: boolean[];
  nextMatch: HomeMatch | null; recent: HomeMatch[]; results?: HomeResult[]; nextTournament: { id: string; name: string; start: string; category: string; status: string; payment: string } | null;
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

export type PlayerProfile = {
  id: string; name: string; gender: 'MALE' | 'FEMALE'; photo: string | null; age: number; club: { id: string; name: string } | null;
  rank: number | null; points: number; wins: number; losses: number; recent: boolean[];
  next: { id: string; name: string; startDate: string } | null;
  tournaments: { id: string; name: string; startDate: string; cats: string[] }[];
  matches: { id: string; tournamentId: string | null; tournament: string; category: string; a: string; b: string; status: string; sets: { a: number; b: number }[]; start: string | null; winner: 'a' | 'b' | null; won: boolean | null }[];
  awards: { date: string; points: number }[];
};
export const playerProfile = (id: string) => call<PlayerProfile>(`/public/players/${id}`);
export type ClubProfile = {
  id: string; name: string; city: string | null; players: { id: string; name: string }[];
  info: { address?: string; phone?: string; email?: string; description?: string; officials?: { name: string; job: string }[]; teams?: string[]; roster?: { name: string; age: number | null }[] } | null;
};
export const clubProfile = (id: string) => call<ClubProfile>(`/public/clubs/${id}`);
export type MatchInfo = {
  id: string; tournamentId: string; tournament: string; category: string; stage: string; round: number; status: string; live: boolean;
  a: string | null; b: string | null; sets: { a: number; b: number }[]; court: string | null; start: string | null; setsToWin: number; decider: string; winner: 'a' | 'b' | null;
};
export const matchInfo = (id: string) => call<MatchInfo>(`/public/matches/${id}`);

export type AdminDoc = { id: string; type: string; player: string; createdAt: string; url: string };
export type AdminClaim = { id: string; user: string; email: string; first: string; last: string; birth: string; forChild: boolean; reason: string | null; candidate: { id: string; name: string; birth: string; linked: boolean } | null };
export const adminDocuments = () => call<AdminDoc[]>('/admin/documents');
export const adminReviewDocument = (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) => call<{ ok: true }>('/admin/documents', { method: 'POST', body: JSON.stringify({ id, decision, note }) });
export const adminClaims = () => call<AdminClaim[]>('/admin/claims');
export const adminResolveClaim = (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) => call<{ ok: true }>('/admin/claims', { method: 'POST', body: JSON.stringify({ id, decision, note }) });

export type AdminUser = { id: string; name: string; email: string; role: string; active: boolean };
export const adminUsers = () => call<AdminUser[]>('/admin/users');
export const adminSetRole = (id: string, role: string) => call<{ ok: true }>('/admin/users', { method: 'POST', body: JSON.stringify({ id, role }) });
export const adminSetActive = (id: string, active: boolean) => call<{ ok: true }>('/admin/users', { method: 'POST', body: JSON.stringify({ id, active }) });
export type AdminLinkRow = { id: string; name: string; birth: string; account: { id: string; email: string } | null; guardians: { userId: string; email: string }[] };
export const adminFindPlayers = (q: string) => call<AdminLinkRow[]>(`/admin/links?q=${encodeURIComponent(q)}`);
export const adminLink = (playerId: string, email: string, mode: 'self' | 'guardian') => call<{ ok: true; user: string }>('/admin/links', { method: 'POST', body: JSON.stringify({ playerId, email, mode }) });
export const adminUnlink = (playerId: string, userId?: string) => call<{ ok: true }>('/admin/links', { method: 'POST', body: JSON.stringify({ playerId, unlink: true, userId }) });

export const adminMessageTargets = () => call<{ clubs: { id: string; name: string }[]; tournaments: { id: string; name: string }[] }>('/admin/messages');
export const adminBroadcast = (audience: 'ALL' | 'CLUB' | 'TOURNAMENT', id: string, title: string, body: string) => call<{ sent: number }>('/admin/messages', { method: 'POST', body: JSON.stringify({ audience, id, title, body }) });
export const adminVenues = () => call<{ id: string; name: string; city: string | null; courts: string[] }[]>('/admin/venues');
export const adminVenueOp = (b: { op: 'venue' | 'courts' | 'delete'; name?: string; city?: string; venue?: string; names?: string }) => call<{ ok: true }>('/admin/venues', { method: 'POST', body: JSON.stringify(b) });
export const adminAudit = () => call<{ id: string; at: string; action: string; entity: string; impersonated: boolean }[]>('/admin/audit');
export const adminReportLink = (kind: string) => call<{ url: string }>('/admin/reports', { method: 'POST', body: JSON.stringify({ kind }) });
export const adminRules = () => call<{ name: string; version: number; verified: boolean; json: string }>('/admin/rules');
export const adminPublishRules = (name: string, json: string) => call<{ version: number }>('/admin/rules', { method: 'POST', body: JSON.stringify({ name, json }) });
type ImportBrief = { created: number; updated: number; errors: number; firstErrors: string[] } | null;
export const adminImport = (b: { kind: 'players' | 'points' | 'db'; csv?: string; url?: string; playersSql?: string; pointsSql?: string; dry: boolean }) =>
  call<{ dry: boolean; result?: ImportBrief; players?: ImportBrief; points?: ImportBrief }>('/admin/import', { method: 'POST', body: JSON.stringify(b) });
