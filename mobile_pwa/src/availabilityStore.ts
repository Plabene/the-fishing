import { type AppState, type Observation, type DisplayStatus } from './models';
export const FRESH_MS = 10 * 60_000;
export function eventStatus(event: Observation, state: AppState, now = Date.now()): DisplayStatus {
  const failure = state.failures.find(f => f.uid === event.uid && f.month === event.date.slice(0, 7) && (!event.observedAt || !f.observedAt || Date.parse(f.observedAt) >= Date.parse(event.observedAt)));
  if (failure) return failure.status;
  if (event.source === 'fixture') return 'DEMO';
  if (!event.verified) return 'UNVERIFIED';
  if (!event.observedAt || Date.parse(event.observedAt) > now + 60_000) return 'UNKNOWN';
  if (event.remaining === null) return 'UNKNOWN';
  if (event.source === 'imported') return 'STALE';
  if (now - Date.parse(event.observedAt) > FRESH_MS) return 'STALE';
  if (event.remaining === null) return 'UNKNOWN';
  return event.remaining >= state.requiredPeople ? 'AVAILABLE' : 'FULL';
}
const DB = 'thefishing-mobile-a';
export function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onblocked = () => reject(new Error('다른 탭을 닫고 다시 시도하세요.'));
  });
}
export async function loadState(): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local', 'readonly'); const request = tx.objectStore('local').get('state');
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function saveState(state: AppState, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const db = await database();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { db.close(); reject(new DOMException('취소되었습니다.', 'AbortError')); return; }
    const tx = db.transaction('local', 'readwrite'); tx.objectStore('local').put(structuredClone(state), 'state');
    const abort = () => { try { tx.abort(); } catch { /* already committed */ } };
    signal?.addEventListener('abort', abort, { once: true });
    const clean = () => { signal?.removeEventListener('abort', abort); db.close(); };
    tx.oncomplete = () => { clean(); resolve(); };
    tx.onabort = tx.onerror = () => { clean(); reject(tx.error || new Error('기기 저장 공간을 확인하세요.')); };
  });
}
