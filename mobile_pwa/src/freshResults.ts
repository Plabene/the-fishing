import type { AppState } from './models';
import type { LiveRow } from './liveQuery';

/** Saved history stays in backups; the live calendar shows only this run's successful reads. */
export function freshQueryView(state:AppState,month:string,rows:LiveRow[]):AppState {
  const success=new Map(rows.filter(r=>r.result.status==='ALLOWED_READABLE' && r.result.fresh && !r.result.cached && r.result.observedAt).map(r=>[r.boat.uid,r.result.observedAt]));
  const failed=new Set(rows.filter(r=>r.result.status!=='ALLOWED_READABLE').map(r=>r.boat.uid));
  const current=state.month===month;
  return {...state,
    events:state.events.filter(e=>current && e.date.startsWith(month+'-') && (e.source==='api' || e.source==='direct') && success.has(e.uid) && success.get(e.uid)===e.observedAt),
    monthChecks:(state.monthChecks || []).filter(c=>current && c.month===month && success.has(c.uid) && success.get(c.uid)===c.observedAt),
    failures:state.failures.filter(f=>current && f.month===month && failed.has(f.uid)),
  };
}
