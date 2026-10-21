import type { AppState, Boat } from './models';
import type { AvailabilityProvider, ProviderResult } from './provider';
export interface LiveRow {boat:Boat; result:ProviderResult}
export async function collectMonth(provider:AvailabilityProvider,boats:Boat[],month:string,signal:AbortSignal,onProgress:(rows:LiveRow[],total:number)=>void=()=>{}) {
  const rows:LiveRow[]=[]; let stopped=false,cancelled=false;
  for(const boat of boats) {
    if(signal.aborted) {cancelled=true;break;}
    try {
      const result=await provider.readMonth(boat,month,signal);
      rows.push({boat,result});onProgress([...rows],boats.length);
      if(result.stop) {stopped=true;break;}
    } catch(error) {if(signal.aborted) {cancelled=true;break;} throw error;}
  }
  return {rows,stopped,cancelled,total:boats.length};
}
export function applyLiveResults(current:AppState,month:string,rows:LiveRow[]):AppState {
  const state=structuredClone(current);
  for(const {boat,result} of rows) {
    if(result.status==='ALLOWED_READABLE' && result.observedAt) {
      state.events=state.events.filter(e=>e.uid!==boat.uid || !e.date.startsWith(month+'-'));
      state.events.push(...result.events);
      state.failures=state.failures.filter(f=>f.uid!==boat.uid || f.month!==month);
      state.monthChecks=(state.monthChecks || []).filter(c=>c.uid!==boat.uid || c.month!==month);
      state.monthChecks.push({uid:boat.uid,month,requiredPeople:1,observedAt:result.observedAt,source:result.source==='api' ? 'api':'direct'});
    } else if(result.status!=='CANCELLED') {
      for(const check of state.monthChecks || []) if(check.uid===boat.uid && check.month===month) delete check.source;
      state.failures=state.failures.filter(f=>f.uid!==boat.uid || f.month!==month);
      state.failures.push({uid:boat.uid,month,observedAt:new Date().toISOString(),status:result.status==='ACCESS_RESTRICTED' || result.status==='AUTH_OR_COOKIE_BLOCKED' ? 'BLOCKED':'UNKNOWN',code:result.httpStatus ? `http_${result.httpStatus}` : result.status.toLowerCase()});
    }
  }
  return state;
}
