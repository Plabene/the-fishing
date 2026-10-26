import { type AppState, type Observation, type DisplayStatus } from './models';
export const FRESH_MS = 10 * 60_000;
export function eventStatus(event: Observation, state: AppState, now = Date.now()): DisplayStatus {
  const failure = state.failures.find(f => f.uid === event.uid && f.month === event.date.slice(0, 7) && (!event.observedAt || !f.observedAt || Date.parse(f.observedAt) >= Date.parse(event.observedAt)));
  if (failure) return failure.status;
  if (event.source === 'fixture') return 'DEMO';
  if (!event.verified) return 'UNVERIFIED';
  if (!event.observedAt || Date.parse(event.observedAt) > now + 60_000) return 'UNKNOWN';
  if(event.remaining===null && !event.reservationStatus) return 'UNKNOWN';
  if (event.source === 'imported') return 'STALE';
  if (now - Date.parse(event.observedAt) > FRESH_MS) return 'STALE';
  if(event.reservationStatus && event.reservationStatus!=='available') return event.reservationStatus==='unknown' ? 'UNKNOWN':'UNAVAILABLE';
  if (event.remaining === null) return 'UNKNOWN';
  return event.remaining >= state.requiredPeople ? 'AVAILABLE' : 'FULL';
}
export {database,loadState,saveState,backupPreferences,previousPreferences,preferenceBackups,StorageConflictError} from './preferenceProtection';
