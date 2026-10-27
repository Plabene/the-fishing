import type { AppState, Boat } from './models';
import type { AvailabilityProvider, ProviderResult } from './provider';
import {boatPlatform} from './platforms';
import {uniqueFleet} from './fleetList';
export interface LiveRow {boat:Boat; result:ProviderResult}
export type QueryConcurrency=number|{perPlatform:number};
export async function collectMonth(provider:AvailabilityProvider,boats:Boat[],month:string,signal:AbortSignal,onProgress:(rows:LiveRow[],total:number)=>void=()=>{},concurrency:QueryConcurrency=1) {
  const unique=uniqueFleet(boats),completed:Array<LiveRow|undefined>=new Array(unique.length);
  // Let both platforms start promptly even when every TheFishing boat precedes Sunsang24 in tier order.
  // Completion rows retain the original order; only dispatch is interleaved and concurrency stays capped.
  const groups=new Map<string,number[]>();unique.forEach((boat,index)=>{const key=boatPlatform(boat),group=groups.get(key) || [];group.push(index);groups.set(key,group);});
  const queue:number[]=[];for(let offset=0;queue.length<unique.length;offset++) for(const group of groups.values()) if(offset<group.length) queue.push(group[offset]);
  // Independent API coordinators must not block each other's client slots. External
  // aliases share TheFishing's pool so they cannot increase its three-call ceiling.
  const queues=typeof concurrency==='number'?[queue]:[
    queue.filter(i=>boatPlatform(unique[i])!=='sunsang24'),queue.filter(i=>boatPlatform(unique[i])==='sunsang24'),
  ];
  const limit=Math.max(1,Math.min(3,Math.floor(typeof concurrency==='number'?concurrency:concurrency.perPlatform)||1));
  let stopped=false,cancelled=false;const stoppedPlatforms=new Set<string>();
  const rows=()=>completed.filter((row):row is LiveRow=>!!row);
  async function worker(pool:{queue:number[];next:number}) {
    while(pool.next<pool.queue.length) {
      if(signal.aborted) {cancelled=true;return;}
      const index=pool.queue[pool.next++],boat=unique[index];
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
  await Promise.all(queues.flatMap(queue=>{const pool={queue,next:0};return Array.from({length:Math.min(queue.length,limit)},()=>worker(pool));}));
  return {rows:rows(),stopped,cancelled,total:unique.length};
}
export function applyLiveResults(current:AppState,month:string,rows:LiveRow[]):AppState {
  const state=structuredClone(current);
  mergeLiveResults(state,month,rows);
  return state;
}
/** Query-local mutable preview; one clone, never mutate saved/user state. */
export function createLivePreview(current:AppState,month:string) {
  const state=structuredClone(current);
  return {append(rows:LiveRow[]) {mergeLiveResults(state,month,rows);return state;}};
}
function mergeLiveResults(state:AppState,month:string,rows:LiveRow[]):void {
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
}
