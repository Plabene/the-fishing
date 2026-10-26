import { TIERS, LABELS, type AppState, type Tier, type Filter, uid } from './models';
export function readTierFilter(value:unknown):Filter {
  if(Array.isArray(value)) return TIERS.filter(t=>value.includes(t));
  return TIERS.includes(value as Tier)?value as Tier:'all';
}
export function matchesTier(tier:Tier,filter:Filter):boolean {return filter==='all' || (Array.isArray(filter)?filter.includes(tier):tier===filter);}
export function tierFilterLabel(filter:Filter):string {return Array.isArray(filter)?filter.length?filter.map(t=>LABELS[t]).join(' · '):'티어 선택 없음':LABELS[filter];}
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
/** A selection registers only previously unassigned boats; deselection never deletes a tier. */
export function selectBoats(state:AppState,ids:Iterable<string>,include:boolean):void {
  const known=new Set(state.boats.map(b=>b.uid)),selected=new Set(state.selectedUids),assigned=new Set(TIERS.flatMap(t=>state.tiers[t]));
  for(const id of ids) if(known.has(id)) {
    if(include) {selected.add(id);if(!assigned.has(id)) {state.tiers.other.push(id);assigned.add(id);}}
    else selected.delete(id);
  }
  state.selectedUids=[...selected];
}
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
