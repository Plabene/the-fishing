import type {AppState} from './models';
import {eventStatus,FRESH_MS} from './availabilityStore';
import type {queryMonth} from './monthlyQuery';
export function calendarStatus(state:AppState,result:ReturnType<typeof queryMonth>,date:string) {
  const rows=result.all.filter(e=>e.date===date),available=rows.filter(e=>eventStatus(e,state)==='AVAILABLE');
  const ships=new Set(available.map(e=>e.uid)).size;
  if(ships) return {kind:'available',label:`${ships}척 가능`,ships};
  if(rows.some(e=>e.source==='fixture')) return {kind:'demo',label:`예시 ${new Set(rows.map(e=>e.uid)).size}척`,ships:0};
  if(rows.some(e=>eventStatus(e,state)==='STALE')) return {kind:'stale',label:'이전 자료',ships:0};
  if(rows.some(e=>['UNKNOWN','UNVERIFIED','BLOCKED'].includes(eventStatus(e,state)))) return {kind:'unknown',label:'정보 미확인',ships:0};
  if(rows.length) return {kind:'unavailable',label:rows.every(e=>e.remaining===0 || e.reservationStatus==='closed')?(result.missingBoats.length?'일부 마감':'예약 마감'):'조건 충족 0척',ships:0};
  const ids=new Set(result.boats.map(b=>b.uid));
  if(state.events.some(e=>e.date===date && ids.has(e.uid))) return {kind:'filtered',label:'조건 불일치',ships:0};
  if(result.failures.length) return {kind:'failed',label:'조회 실패',ships:0};
  if(result.missingBoats.length) return {kind:result.failures.length?'failed':'unqueried',label:result.failures.length?'조회 실패':result.checkedCount?'일부 미확인':'조회 전',ships:0};
  const checks=(state.monthChecks || []).filter(c=>ids.has(c.uid) && c.month===date.slice(0,7));
  const now=Date.now(),fresh=new Set(checks.filter(c=>(c.source==='api' || c.source==='direct') && now-Date.parse(c.observedAt)<=FRESH_MS && Date.parse(c.observedAt)<=now+60000).map(c=>c.uid));
  if(result.boats.length && fresh.size<result.boats.length) return {kind:'stale',label:'이전 자료',ships:0};
  return {kind:'empty',label:result.boats.length?'일정 없음':'선박 선택',ships:0};
}
