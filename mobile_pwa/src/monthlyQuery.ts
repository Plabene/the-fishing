import { type AppState, type Filter, type Observation } from './models';
import { orderedBoats, tierFor } from './tierStore';
import { eventStatus } from './availabilityStore';

export interface MonthQuery { month:string; requiredPeople:number; tier:Filter; search:string; matchingOnly:boolean }
export function validateQuery(query:MonthQuery):void {
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(query.month)) throw new Error('조회할 연월을 선택하세요.');
  if (!Number.isInteger(query.requiredPeople) || query.requiredPeople<1 || query.requiredPeople>100) throw new Error('인원은 1~100명으로 입력하세요.');
}
export function queryMonth(state:AppState, query:MonthQuery, now=Date.now()) {
  validateQuery(query);
  const context={...state,month:query.month,requiredPeople:query.requiredPeople};
  const boats=orderedBoats(state).filter(b=>state.selectedUids.includes(b.uid) && (query.tier==='all' || tierFor(state,b.uid)===query.tier));
  const ids=new Set(boats.map(b=>b.uid)), order=new Map(boats.map((b,i)=>[b.uid,i]));
  const search=query.search.trim().toLocaleLowerCase();
  const all=state.events.filter(e=> {
    if (!ids.has(e.uid) || !e.date.startsWith(query.month+'-')) return false;
    const b=boats.find(b=>b.uid===e.uid);
    return !search || `${b?.name} ${b?.port} ${e.trip} ${e.species || ''}`.toLocaleLowerCase().includes(search);
  }).sort((a,b)=>a.date.localeCompare(b.date) || order.get(a.uid)!-order.get(b.uid)! || a.departure.localeCompare(b.departure) || a.trip.localeCompare(b.trip));
  const meetsPeople=(e:Observation) => {
    const status=eventStatus(e,context,now);
    return (e.verified || e.source==='fixture') && status!=='BLOCKED' && status!=='UNKNOWN' && status!=='UNVERIFIED' && e.remaining!==null && e.remaining>=query.requiredPeople;
  };
  const matches=all.filter(meetsPeople), events=query.matchingOnly ? matches : all;
  const days=[...new Set(events.map(e=>e.date))];
  const checked=new Set((state.monthChecks || []).filter(c=>c.month===query.month && c.requiredPeople<=query.requiredPeople && ids.has(c.uid)).map(c=>c.uid));
  for (const e of all) checked.add(e.uid);
  const failures=state.failures.filter(f=>f.month===query.month && ids.has(f.uid));
  const dates=all.flatMap(e=>e.observedAt ? [e.observedAt] : []);
  dates.push(...(state.monthChecks || []).filter(c=>c.month===query.month && ids.has(c.uid)).map(c=>c.observedAt));
  dates.sort((a,b)=>Date.parse(b)-Date.parse(a));
  return {events,all,matches,days,boats,checkedCount:checked.size,missingBoats:boats.filter(b=>!checked.has(b.uid)),failures,latest:dates[0] || null,
    liveCount:events.filter(e=>eventStatus(e,context,now)==='AVAILABLE').length};
}
