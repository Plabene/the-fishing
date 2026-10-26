import {emptyState,TIERS,uid,type AppState,type Boat} from './models';

const DB='thefishing-mobile-a';
export interface PreferenceSnapshot {
  tiers:AppState['tiers'];selectedUids:string[];boats?:Boat[];savedAt?:string;
  publishedPreferencesVersion?:string;sunsangTierVersion?:string;preferenceRecoveryVersion?:string;
}
export interface PreferenceBackup {key:string;value:PreferenceSnapshot}
let expectedRevision:number|null=null,readFailed=false;
export class StorageConflictError extends Error {constructor(){super('다른 탭에서 설정이 변경됐습니다. 새로고침 후 다시 시도하세요.');}}
export function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('local');
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('다른 탭을 닫고 다시 시도하세요.'));
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
}
function validPreferences(value:unknown):value is PreferenceSnapshot {
  if(!value || typeof value!=='object') return false;
  const p=value as PreferenceSnapshot;
  if(!p.tiers || !Array.isArray(p.selectedUids)) return false;
  const tiers=TIERS.flatMap(t=>Array.isArray(p.tiers[t])?p.tiers[t]:[null]);
  return [...tiers,...p.selectedUids].every(id=>typeof id==='string' && !!id && uid(id)===id) && new Set(tiers).size===tiers.length && new Set(p.selectedUids).size===p.selectedUids.length;
}
export function preferenceSnapshot(state:AppState):PreferenceSnapshot {
  const ids=new Set([...TIERS.flatMap(t=>state.tiers[t]),...state.selectedUids]);
  return {tiers:structuredClone(state.tiers),selectedUids:[...state.selectedUids],boats:structuredClone(state.boats.filter(b=>ids.has(b.uid))),savedAt:new Date().toISOString(),
    ...(state.preferenceRecoveryVersion?{preferenceRecoveryVersion:state.preferenceRecoveryVersion}:{}),...(state.publishedPreferencesVersion?{publishedPreferencesVersion:state.publishedPreferencesVersion}:{}),...(state.sunsangTierVersion?{sunsangTierVersion:state.sunsangTierVersion}:{})};
}
const signature=(p:PreferenceSnapshot)=>JSON.stringify([p.tiers,p.selectedUids,p.boats]);
export async function loadState():Promise<unknown> {
  try {
    const db=await database();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('local','readonly'),store=tx.objectStore('local'),raw=store.get('state'),prefs=store.get('personal-preferences-v1'),revision=store.get('state-revision');
      tx.oncomplete=()=>{
        db.close();
        try {
          const saved=raw.result,protectedValue=prefs.result as PreferenceSnapshot|undefined;
          if(saved!==undefined && (!saved || saved.schema!==1 || !Array.isArray(saved.boats) || !validPreferences(saved))) throw new Error('기기 자료 형식 오류. 기존 자료를 덮어쓰지 않습니다.');
          if(protectedValue!==undefined && !validPreferences(protectedValue)) throw new Error('개인 설정 보호본 형식 오류. 백업 확인이 필요합니다.');
          expectedRevision=Number(revision.result)||0;readFailed=false;
          if(!protectedValue) {resolve(saved);return;}
          // Old tabs may still write the former single state key. The independent record remains authoritative.
          const result:AppState=saved?structuredClone(saved):{...emptyState(),fleetBaseline:[]};
          result.tiers=structuredClone(protectedValue.tiers);result.selectedUids=[...protectedValue.selectedUids];
          const known=new Set(result.boats.map(b=>b.uid));
          for(const boat of protectedValue.boats || []) if(!known.has(boat.uid)) {result.boats.push(structuredClone(boat));known.add(boat.uid);}
          for(const key of ['publishedPreferencesVersion','sunsangTierVersion','preferenceRecoveryVersion'] as const) if(protectedValue[key]) result[key]=protectedValue[key];
          resolve(result);
        } catch(error) {reject(error);}
      };
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || new Error('기기 자료 읽기 실패'));};
    });
  } catch(error) {readFailed=true;throw error;}
}
export async function saveState(state:AppState,signal?:AbortSignal):Promise<void> {
  signal?.throwIfAborted();
  if(readFailed) throw new Error('설정 읽기에 실패해 저장을 중지했습니다. 새로고침 후 복구하세요.');
  const wantedRevision=expectedRevision,db=await database();
  return new Promise((resolve,reject)=>{
    if(signal?.aborted) {db.close();reject(new DOMException('취소되었습니다.','AbortError'));return;}
    const tx=db.transaction('local','readwrite'),store=tx.objectStore('local'),revision=store.get('state-revision'),old=store.get('state'),protectedRead=store.get('personal-preferences-v1');
    let error:Error|null=null,nextRevision=0,ready=0;
    const abort=()=>{try{tx.abort();}catch{/* already committed */}};
    signal?.addEventListener('abort',abort,{once:true});
    const write=()=>{
      if(++ready!==3) return;
      try {
      const actual=Number(revision.result)||0;
      if(wantedRevision!==null && wantedRevision!==actual) {error=new StorageConflictError();abort();return;}
      nextRevision=actual+1;
      const previous=protectedRead.result || (validPreferences(old.result) && Array.isArray(old.result.boats)?preferenceSnapshot(old.result as AppState):undefined),next=preferenceSnapshot(state);
      if(!validPreferences(next)) {error=new Error('개인 티어 형식 오류. 저장을 중지합니다.');abort();return;}
      // A transaction commits the state, protected preferences and recovery history together, or none.
      if(previous && signature(previous)!==signature(next)) store.put(previous,`preferences-history:${String(actual).padStart(12,'0')}`);
      if(!previous || signature(previous)!==signature(next)) store.put(next,`preferences-history:${String(nextRevision).padStart(12,'0')}`);
      store.put(next,'personal-preferences-v1');store.put(structuredClone(state),'state');store.put(nextRevision,'state-revision');
      } catch(cause) {error=cause instanceof Error?cause:new Error('설정 저장 실패');abort();}
    };
    for(const request of [revision,old,protectedRead]) request.onsuccess=write;
    const clean=()=>{signal?.removeEventListener('abort',abort);db.close();};
    tx.oncomplete=()=>{expectedRevision=nextRevision;clean();resolve();};
    tx.onabort=tx.onerror=()=>{clean();reject(error || tx.error || new Error('기기 저장 공간을 확인하세요.'));};
  });
}
export async function backupPreferences(state:AppState,version:string):Promise<void> {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('local','readwrite'),store=tx.objectStore('local'),key=`preferences-before:${version}`,read=store.get(key);
    read.onsuccess=()=>{if(read.result===undefined) store.put(preferenceSnapshot(state),key);};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || new Error('설정 백업 실패'));};
  });
}
export async function preferenceBackups():Promise<PreferenceBackup[]> {
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('local','readonly'),store=tx.objectStore('local'),keys=store.getAllKeys(),values=store.getAll();
    tx.oncomplete=()=>{db.close();resolve(keys.result.flatMap((key,index)=>typeof key==='string' && /^(preferences-before:|preferences-history:)/.test(key) && validPreferences(values.result[index])?[{key,value:values.result[index]}]:[]).reverse());};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || new Error('설정 백업 읽기 실패'));};
  });
}
export async function previousPreferences(version:string):Promise<Pick<AppState,'tiers'|'selectedUids'>|undefined> {
  const p=(await preferenceBackups()).find(p=>p.key===`preferences-before:${version}`)?.value;
  return p?{tiers:p.tiers,selectedUids:p.selectedUids}:undefined;
}
