import { emptyState, type AppState } from '../models';

export function fixtureState(month: string): AppState {
  const state = emptyState(); state.month = month;
  state.boats = [
    { uid: 'demo-1', name: '예시 · 파도호', port: '예시 항구', url: '' },
    { uid: 'demo-2', name: '예시 · 바람호', port: '예시 항구', url: '' },
    { uid: 'demo-3', name: '예시 · 달빛호', port: '예시 항구', url: '' },
  ];
  state.selectedUids = state.boats.map(b => b.uid);
  state.tiers.tier1 = ['demo-1']; state.tiers.tier2 = ['demo-2']; state.tiers.other = ['demo-3'];
  for (const [index, day] of [3, 9, 16, 23].entries()) for (const [b, boat] of state.boats.entries()) {
    state.events.push({ id: `demo-${index}-${b}`, uid: boat.uid, date: `${month}-${String(day).padStart(2, '0')}`,
      trip: ['주꾸미 출조', '갑오징어 출조', '우럭 출조'][b], port: boat.port, departure: '05:30',
      remaining: [4, 2, null][b], verified: false, observedAt: null, source: 'fixture' });
  }
  return state;
}
