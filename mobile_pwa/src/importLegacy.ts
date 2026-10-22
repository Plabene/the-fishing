import { type AppState, type Observation, type Failure, emptyState, text, uid, reservationLink, dateOnly, timestamp, TIERS } from './models';
import { normalizeTiers } from './tierStore';
import { eventSpecies, speciesFilterKey, speciesLabel, normalizeSpeciesSelection } from './species';
import { mergeTideDays } from './tides';
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function importData(input: unknown, current = emptyState()): { state: AppState; warnings: string[] } {
  const root = obj(input); const state = structuredClone(current); const warnings: string[] = [];
  const backup = root.schema === 1 && Array.isArray(root.boats) && !!root.tiers;
  const bundled = !!root.catalog || !!root.preferences || !!root.snapshots;
  const catalog = obj(root.catalog || root); const prefs = obj(root.preferences || root);
  let recognized = backup || bundled;
  if (backup) {
    Object.assign(state, emptyState()); delete state.fleetSeedVersion; delete state.monthlyArchiveVersion; delete state.monthChecks; delete state.selectedSpecies; delete state.excludedSpeciesKeys; delete state.tideDays;
    for (const key of ['fleetSeedVersion','monthlyArchiveVersion'] as const) if (typeof root[key] === 'string' && /^[a-f0-9]{16}$/.test(root[key])) state[key] = root[key];
  }
  const entries = backup ? arr(root.boats) : Object.values(obj(catalog.entries));
  for (const item of entries) {
    const b = obj(item); if (!('boat_uid' in b) && !backup) continue;
    recognized = true; const id = uid(b.uid ?? b.boat_uid); if (!id) { warnings.push('UID 없는 선박을 건너뛰었습니다.'); continue; }
    const boat = { uid: id, name: text(b.name ?? b.boat_name) || `UID ${id}`, port: text(b.port ?? b.departure_port), url: reservationLink(b.url ?? b.reservation_url, id) };
    const index = state.boats.findIndex(v => v.uid === id);
    if (index >= 0) { warnings.push(`중복 UID ${id}: 마지막 선박 정보를 사용합니다.`); state.boats[index] = boat; } else state.boats.push(boat);
  }
  if (backup || 'boat_tiers' in prefs || 'selected_boat_uids' in prefs) {
    recognized = true;
    state.tiers = normalizeTiers(backup ? root.tiers : prefs.boat_tiers, arr(prefs.selected_boat_uids));
    const selection = backup ? root.selectedUids : prefs.selected_boat_uids;
    state.selectedUids = [...new Set((Array.isArray(selection) ? selection : TIERS.flatMap(t => state.tiers[t])).map(uid).filter(Boolean))];
  }
  const month = backup ? root.month : `${prefs.selected_year}-${String(prefs.selected_month).padStart(2, '0')}`;
  if (/^20\d\d-(?:0[1-9]|1[0-2])$/.test(String(month))) state.month = String(month);
  const people = Number(backup ? root.requiredPeople : prefs.required_people);
  if (Number.isInteger(people) && people >= 1 && people <= 100) state.requiredPeople = people;
  if(backup && (typeof root.selectedSpecies==='string' || Array.isArray(root.selectedSpecies))) state.selectedSpecies=normalizeSpeciesSelection(root.selectedSpecies);
  const excluded=backup ? root.excludedSpeciesKeys:prefs.excluded_species_keys;
  if(Array.isArray(excluded)) state.excludedSpeciesKeys=[...new Set(excluded.filter(v=>typeof v==='string').slice(0,200).map(speciesFilterKey).filter((key):key is string=>key!==null))];
  if(backup && Array.isArray(root.tideDays)) state.tideDays=mergeTideDays(root.tideDays);
  function readResult(value: unknown, observed?: unknown) {
    const r = obj(value); if (!Array.isArray(r.events)) return;
    recognized = true; const query = obj(r.query);
    const fallbackTime = timestamp(observed ?? r.completed_at);
    const month = `${query.year}-${String(query.month).padStart(2, '0')}`;
    const failures = arr(r.boat_failures);
    if (!backup && !r.partial && !r.cancelled && !r.stale && fallbackTime) {
      const failed = new Set(failures.map(f=>uid(obj(f).boat_uid)));
      for (const boatId of arr(query.boat_uids)) if (!failed.has(uid(boatId))) putCheck({uid:boatId,month,requiredPeople:query.required_people,observedAt:fallbackTime});
    }
    for (const item of failures) {
      const f = obj(item); const id = uid(f.boat_uid); if (!id || !/^20\d\d-\d\d$/.test(month)) continue;
      const code = text(f.error_code) || 'request_failed';
      putFailure({ uid: id, month, observedAt: fallbackTime, status: /403|429|401|block|restrict|permission|auth|access_denied|rate_limited|security_html|robots_disallowed/i.test(code) ? 'BLOCKED' : 'UNKNOWN', code });
    }
    for (const item of arr(r.events)) {
      const e = obj(item); const id = uid(e.uid ?? e.boat_uid); const day = dateOnly(e.date);
      if (!id || !day) { warnings.push('유효하지 않은 관측 자료를 건너뛰었습니다.'); continue; }
      if (!backup && !state.boats.some(b => b.uid === id)) state.boats.push({ uid: id, name: text(e.boat_name) || `UID ${id}`, port: text(e.departure_port), url: reservationLink(e.reservation_url, id) });
      const seats = e.remaining ?? e.remaining_seats;
      const remaining = typeof seats === 'number' && Number.isInteger(seats) && seats >= 0 && seats <= 10000 ? seats : null;
      const source: Observation['source'] = backup && e.source === 'fixture' ? 'fixture' : 'imported';
      const observedAt = backup ? timestamp(e.observedAt) : fallbackTime;
      const event: Observation = { id: text(e.id ?? e.event_id, 200) || `${id}:${day}:${text(e.trip ?? e.trip_name)}`, uid: id, date: day,
        trip: text(e.trip ?? e.trip_name), port: text(e.port ?? e.departure_port), departure: text(e.departure ?? e.departure_time),
        remaining, verified: e.verified === true && source !== 'fixture', observedAt, source };
      event.speciesKey=eventSpecies({...event,speciesKey:text(e.speciesKey ?? e.species_key),species:text(e.species ?? e.species_label)});
      event.species=speciesLabel(event.speciesKey);
      if ('price' in e || 'price_won' in e) {
        const price=e.price ?? e.price_won;
        event.price=typeof price==='number' && Number.isInteger(price) && price>=0 && price<=100000000 ? price : null;
      }
      // A timestamp-free or older snapshot never overwrites a newer observation.
      const key = state.events.findIndex(v => v.id === event.id && v.uid === id && v.date === day);
      if (key < 0) state.events.push(event);
      else if (Date.parse(observedAt || '') >= Date.parse(state.events[key].observedAt || '') || !state.events[key].observedAt) state.events[key] = event;
    }
  }
  function putFailure(f: Failure) {
    const index = state.failures.findIndex(v => v.uid === f.uid && v.month === f.month);
    if (index < 0) state.failures.push(f);
    else if (!f.observedAt || !state.failures[index].observedAt || Date.parse(f.observedAt) >= Date.parse(state.failures[index].observedAt!)) state.failures[index] = f;
  }
  function putCheck(value: Obj) {
    const id=uid(value.uid), month=text(value.month), observedAt=timestamp(value.observedAt), requiredPeople=Number(value.requiredPeople);
    if (!id || !/^20\d\d-(0[1-9]|1[0-2])$/.test(month) || !observedAt || !Number.isInteger(requiredPeople) || requiredPeople<1 || requiredPeople>100) return;
    const checks=state.monthChecks ||= [], key=checks.findIndex(c=>c.uid===id && c.month===month && c.requiredPeople===requiredPeople);
    const check={uid:id,month,requiredPeople,observedAt};
    if (key<0) checks.push(check); else if (Date.parse(observedAt)>=Date.parse(checks[key].observedAt)) checks[key]=check;
  }
  if (backup) {
    readResult(root);
    for (const check of arr(root.monthChecks)) putCheck(obj(check));
    for (const item of arr(root.failures)) { const f = obj(item); const id = uid(f.uid); const month = text(f.month); if (id && /^20\d\d-(?:0[1-9]|1[0-2])$/.test(month)) putFailure({ uid: id, month, observedAt: timestamp(f.observedAt), status: f.status === 'BLOCKED' ? 'BLOCKED' : 'UNKNOWN', code: text(f.code) }); }
  } else {
    const snapshots = root.snapshots || root;
    const snap = obj(snapshots);
    if (Array.isArray(snapshots)) for (const r of snapshots) readResult(r);
    else if (Array.isArray(snap.events)) readResult(snap);
    else {
      const preferred=new Map<string,Obj>(), others:Obj[]=[];
      for (const entry of Object.values(obj(snap.entries))) {
        const r=obj(obj(entry).result), q=obj(r.query), ids=arr(q.boat_uids).map(uid).filter(Boolean), people=Number(q.required_people);
        if (!Array.isArray(r.events)) continue;
        if (ids.length!==1 || arr(r.boat_failures).length || r.partial || r.cancelled || r.stale || !timestamp(r.completed_at) || !Number.isInteger(people) || people<1 || people>100) { others.push(r); continue; }
        const key=`${ids[0]}:${q.year}-${q.month}`, old=preferred.get(key), oldPeople=Number(obj(old?.query).required_people);
        if (!old || people<oldPeople || (people===oldPeople && Date.parse(String(r.completed_at))>Date.parse(String(old.completed_at)))) preferred.set(key,r);
      }
      for (const r of [...preferred.values(),...others]) readResult(r);
    }
  }
  if (!recognized) throw new Error('지원하는 선박 목록·월별 설정·캐시·백업 JSON이 아닙니다.');
  const known = new Set(state.boats.map(b => b.uid));
  for (const id of [...TIERS.flatMap(t => state.tiers[t]), ...state.selectedUids]) if (!known.has(id)) {
    warnings.push(`목록에 없는 UID ${id}: 순서를 보존했습니다.`);
    state.boats.push({ uid: id, name: `UID ${id} · 정보 없음`, port: '', url: '' }); known.add(id);
  }
  if (backup && !('selectedUids' in root) && !state.selectedUids.length) state.selectedUids = state.boats.map(b => b.uid);
  if (state.events.length > 50000 || state.boats.length > 10000 || (state.monthChecks?.length || 0)>50000) throw new Error('가져오기 자료가 너무 큽니다.');
  return { state, warnings: [...new Set(warnings)] };
}
export function exportData(state: AppState): string {
  // Run through the allowlist again, stripping any unexpected runtime properties.
  return JSON.stringify(importData(state).state, null, 2);
}
