import type { AppState, Boat } from './models';
import type { AvailabilityProvider, ProviderResult } from './provider';
import {boatPlatform} from './platforms';
export interface LiveRow {boat:Boat; result:ProviderResult}
export async function collectMonth(provider:AvailabilityProvider,boats:Boat[],month:string,signal:AbortSignal,onProgress:(rows:LiveRow[],total:number)=>void=()=>{},concurrency=1) {
  const unique=[...new Map(boats.map(boat=>[boat.uid,boat])).values()],completed:Array<LiveRow|undefined>=new Array(unique.length);
  let next=0,stopped=false,cancelled=false;const stoppedPlatforms=new Set<string>();
  const rows=()=>completed.filter((row):row is LiveRow=>!!row);
  async function worker() {
    while(next<unique.length) {
      if(signal.aborted) {cancelled=true;return;}
      const index=next++,boat=unique[index];
      if(stoppedPlatforms.has(boatPlatform(boat))) continue;
      try {
        const result=await provider.readMonth(boat,month,signal);
        completed[index]={boat,result};if(result.stop) {stopped=true;stoppedPlatforms.add(boatPlatform(boat));}
        onProgress(rows(),unique.length);
      } catch(error) {
        if(signal.aborted) {cancelled=true;return;}
        completed[index]={boat,result:{status:'API_UNAVAILABLE',events:[],message:'이 플랫폼의 조회 처리에 실패했습니다.',source:'api',stop:true}};
        stopped=true;stoppedPlatforms.add(boatPlatform(boat));onProgress(rows(),unique.length);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(unique.length,Math.max(1,Math.min(3,Math.floor(concurrency)||1)))},worker));
  return {rows:rows(),stopped,cancelled,total:unique.length};
}
export function applyLiveResults(current:AppState,month:string,rows:LiveRow[]):AppState {
  const state=structuredClone(current);
  const successful=new Set(rows.filter(r=>r.result.status==='ALLOWED_READABLE' && r.result.observedAt).map(r=>r.boat.uid));
  state.events=state.events.filter(e=>!successful.has(e.uid) || !e.date.startsWith(month+'-'));
  for(const {boat,result} of rows) {
    if(result.status==='ALLOWED_READABLE' && result.observedAt) {
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
