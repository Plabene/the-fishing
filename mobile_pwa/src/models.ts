import sourceLinks from './data/sourceLinks.json';
export const TIERS = ['tier1', 'tier2', 'tier3', 'other'] as const;
export type Tier = typeof TIERS[number];
export type Filter = Tier | 'all';
export const LABELS: Record<Filter, string> = { all: '전체', tier1: '1티어', tier2: '2티어', tier3: '3티어', other: '기타' };
export type GateStatus = 'UNVERIFIED' | 'ALLOWED_READABLE' | 'CORS_DENIED' | 'AUTH_OR_COOKIE_BLOCKED' | 'ACCESS_RESTRICTED' | 'PARSER_UNSUPPORTED' | 'PERMISSION_DENIED' | 'HTTP_ERROR' | 'NETWORK_OR_CORS' | 'TIMEOUT' | 'UNSUPPORTED_SOURCE' | 'CANCELLED' | 'API_UNAVAILABLE' | 'API_BUSY' | 'API_NOT_CONFIGURED';
export type DisplayStatus = 'AVAILABLE' | 'UNKNOWN' | 'STALE' | 'BLOCKED' | 'UNVERIFIED' | 'FULL' | 'DEMO';
export interface Boat { uid: string; name: string; port: string; url: string }
export interface Observation {
  id: string; uid: string; date: string; trip: string; port: string; departure: string;
  remaining: number | null; verified: boolean; observedAt: string | null;
  source: 'imported' | 'fixture' | 'direct' | 'api';
  species?: string; speciesKey?: string; price?: number | null;
}
export interface MonthCheck { uid: string; month: string; requiredPeople: number; observedAt: string; source?: 'direct' | 'api' }
export interface Failure { uid: string; month: string; observedAt: string | null; status: 'UNKNOWN' | 'BLOCKED'; code: string }
export interface AppState {
  schema: 1; boats: Boat[]; tiers: Record<Tier, string[]>; events: Observation[];
  failures: Failure[]; month: string; requiredPeople: number; selectedUids: string[]; fleetSeedVersion?: string;
  monthlyArchiveVersion?: string; monthChecks?: MonthCheck[];
  selectedSpecies?: string; excludedSpeciesKeys?: string[];
}
export function localMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now);
}
export const emptyState = (): AppState => ({ schema: 1, boats: [], tiers: { tier1: [], tier2: [], tier3: [], other: [] }, events: [], failures: [], month: localMonth(), requiredPeople: 1, selectedUids: [] });
export function text(value: unknown, max = 160): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g, '[연락처 제외]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[연락처 제외]').trim().slice(0, max) : '';
}
export function uid(value: unknown): string { const id = text(value, 160); return /^[\p{L}\p{M}\p{N}:_-]{1,160}$/u.test(id) ? id : ''; }
export function dateOnly(value: unknown): string | null {
  const s = text(value); const d = new Date(`${s}T00:00:00Z`);
  return /^20\d\d-\d\d-\d\d$/.test(s) && Number.isFinite(+d) && d.toISOString().slice(0, 10) === s ? s : null;
}
export function timestamp(value: unknown): string | null {
  const s = text(value);
  // Naive local times have no trustworthy timezone; keep them unknown.
  return /^20\d\d-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.now() + 60_000 ? s : null;
}
export function officialDetail(value: unknown, expectedUid?: string): string {
  try {
    const u = new URL(text(value, 1000)); const id = u.searchParams.get('uid') || '';
    if (u.protocol !== 'https:' || u.hostname !== 'thefishing.kr' || u.port || u.username || u.password || u.pathname !== '/reservation/list.php' || !/^\d+$/.test(id) || (expectedUid && id !== expectedUid)) return '';
    if ([...u.searchParams.keys()].some(k => k !== 'uid') || u.searchParams.getAll('uid').length !== 1 || u.hash) return '';
    return `https://thefishing.kr/reservation/list.php?uid=${id}`;
  } catch { return ''; }
}
/** Navigation only: exact saved external/fleet links never become collection endpoints. */
export function reservationLink(value: unknown, expectedUid: string): string {
  const direct = officialDetail(value, expectedUid);
  if (direct) return direct;
  const registered = Object.hasOwn(sourceLinks, expectedUid) ? (sourceLinks as Record<string, string>)[expectedUid] : '';
  return registered && value === registered ? registered : '';
}
