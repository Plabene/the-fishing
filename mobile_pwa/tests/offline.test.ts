import { describe, expect, test } from 'vitest';
import 'fake-indexeddb/auto';
import { emptyState, officialDetail } from '../src/models';
import { importData, exportData } from '../src/importLegacy';
import { eventStatus, saveState, loadState } from '../src/availabilityStore';

const observedAt = new Date().toISOString();
const observation = { id: 'fixture', uid: '1', date: '2026-09-09', trip: '보관 출조', port: '보관 항구', departure: '05:00', remaining: 4, verified: true, observedAt, source: 'imported' as const };
describe('offline import safety', () => {
  test('fresh imported observations remain stale', () => {
    expect(eventStatus(observation, emptyState())).toBe('STALE');
  });
  test('blocked observations retain their access restriction', () => {
    const state = emptyState(); state.failures.push({ uid: '1', month: '2026-09', observedAt, status: 'BLOCKED', code: 'access_denied' });
    expect(eventStatus(observation, state)).toBe('BLOCKED');
  });
  test('legacy monthly cache imports without making a network request', () => {
    const value = { entries: { cached: { result: { completed_at: observedAt, query: { year: 2026, month: 9 }, events: [
      { event_id: 'fixture', boat_uid: '1', date: '2026-09-09', remaining_seats: 4, verified: true },
    ] } } } };
    const result = importData(value).state;
    expect(result.events).toHaveLength(1);
    expect(eventStatus(result.events[0], result)).toBe('STALE');
  });
  test('backup exports only allowed data', () => {
    const state = { ...emptyState(), password: 'should-not-export' };
    state.events.push(observation);
    const data = exportData(state);
    expect(data).not.toContain('should-not-export');
    expect(importData(JSON.parse(data)).state.events).toHaveLength(1);
  });
  test('invalid import leaves existing data intact', () => {
    const state = emptyState(); state.events.push(observation);
    expect(() => importData({ nonsense: true }, state)).toThrow();
    expect(state.events).toEqual([observation]);
  });
  test('credential-bearing and unrelated URLs are rejected', () => {
    expect(officialDetail('https://thefishing.kr/reservation/list.php?uid=1&token=secret')).toBe('');
    expect(officialDetail('javascript:alert(1)')).toBe('');
  });
  test('records survive an IndexedDB reload', async () => {
    const state = emptyState(); state.events.push(observation);
    await saveState(state);
    expect(await loadState()).toEqual(state);
  });
});
