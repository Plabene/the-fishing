import {database,FRESH_MS} from './availabilityStore';
import type {ProviderResult} from './provider';

export interface ApiResponseCache {get(key:string):Promise<unknown>;put(key:string,result:ProviderResult):Promise<void>}
const PREFIX='api-response:species-v3:',INDEX=PREFIX+'index';
interface Entry {key:string;observedAt:string}
// This cache only receives validated network responses. Imported backups never populate it.
export const persistentApiCache:ApiResponseCache={
  async get(key) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('local','readonly'),request=tx.objectStore('local').get(PREFIX+key);
      tx.oncomplete=()=>{db.close();resolve(request.result);};
      tx.onabort=tx.onerror=()=>{db.close();reject(tx.error || new Error('조회 캐시 읽기 실패'));};
    });
  },
  async put(key,result) {
    if(result.status!=='ALLOWED_READABLE' || !result.observedAt || new TextEncoder().encode(JSON.stringify(result)).length>500000) return;
    const db=await database();
    return new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('local','readwrite'),store=tx.objectStore('local'),request=store.get(INDEX),fullKey=PREFIX+key;
      request.onsuccess=()=>{
        const old:Entry[]=Array.isArray(request.result) ? request.result.filter((entry:unknown):entry is Entry=>!!entry && typeof entry==='object' && typeof (entry as Entry).key==='string' && typeof (entry as Entry).observedAt==='string'):[];
        const kept=old.filter(entry=>entry.key!==fullKey && Date.now()-Date.parse(entry.observedAt)<FRESH_MS);
        for(const entry of old) if(!kept.includes(entry) && entry.key.startsWith(PREFIX)) store.delete(entry.key);
        kept.push({key:fullKey,observedAt:result.observedAt!});
        while(kept.length>256) store.delete(kept.shift()!.key);
        store.put(structuredClone(result),fullKey);store.put(kept,INDEX);
      };
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onabort=tx.onerror=()=>{db.close();reject(tx.error || new Error('조회 캐시 저장 실패'));};
    });
  },
};
