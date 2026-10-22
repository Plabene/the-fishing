import { TIERS, type AppState, type Tier, uid } from './models';
export function normalizeTiers(raw: unknown, selected: unknown[] = []): Record<Tier, string[]> {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const result: Record<Tier, string[]> = { tier1: [], tier2: [], tier3: [], other: [] };
  const seen = new Set<string>();
  for (const tier of TIERS) for (const v of Array.isArray(data[tier]) ? data[tier] as unknown[] : []) {
    const id = uid(v); if (id && !seen.has(id)) { result[tier].push(id); seen.add(id); }
  }
  for (const v of selected) { const id = uid(v); if (id && !seen.has(id)) { result.other.push(id); seen.add(id); } }
  return result;
}
export function tierFor(state: AppState, id: string): Tier { return TIERS.find(t => state.tiers[t].includes(id)) || 'other'; }
export function moveBoat(state: AppState, id: string, tier: Tier, offset?: number): void {
  const old = state.tiers[tier].indexOf(id);
  for (const t of TIERS) state.tiers[t] = state.tiers[t].filter(v => v !== id);
  const index = offset === undefined ? state.tiers[tier].length : Math.max(0, Math.min(state.tiers[tier].length, old + offset));
  state.tiers[tier].splice(index, 0, id);
}
export function removeBoat(state: AppState, id: string): void {
  for (const t of TIERS) state.tiers[t] = state.tiers[t].filter(v => v !== id);
  state.boats = state.boats.filter(b => b.uid !== id);
  state.selectedUids = state.selectedUids.filter(v => v !== id);
  state.events = state.events.filter(e => e.uid !== id); state.failures = state.failures.filter(f => f.uid !== id);
  if (state.monthChecks) state.monthChecks=state.monthChecks.filter(c=>c.uid!==id);
}
export function orderedBoats(state: AppState) {
  const order = [...TIERS.flatMap(t => state.tiers[t]), ...state.boats.map(b => b.uid)];
  const byId=new Map(state.boats.map(b=>[b.uid,b]));
  return [...new Set(order)].flatMap(id => {const boat=byId.get(id);return boat ? [boat]:[];});
}
