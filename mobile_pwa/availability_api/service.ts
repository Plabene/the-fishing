import { parseHTML } from 'linkedom';
import { TheFishingDirect, waitFor, type MetadataCache, type CalendarMetadata } from '../src/providers/thefishingDirect';
import type { AvailabilityProvider, ProviderResult } from '../src/provider';

export interface Store {
  get<T>(key:string):Promise<T|undefined>;
  put<T>(key:string,value:T):Promise<unknown>;
  delete(key:string):Promise<unknown>;
}
interface Limits {windowStart:number;count:number;blockedUntil:number;block?:ProviderResult}
interface Entry {expires:number;result:ProviderResult}
class Serial {
  private tail:Promise<unknown>=Promise.resolve();
  run<T>(action:()=>Promise<T>):Promise<T> {const result=this.tail.then(action);this.tail=result.catch(()=>{});return result;}
}
export function sourceProvider(metadata?:MetadataCache):AvailabilityProvider {
  const dom=parseHTML('<!doctype html><html><body></body></html>').document as unknown as Document;
  // Workers support manual/follow redirects. Never follow: the provider rejects every non-200 response.
  return new TheFishingDirect((input,init)=>fetch(input,{...init,redirect:'manual'}),1000,10000,dom,metadata,24*3600000);
}
export const apiFailure=(status:ProviderResult['status'],message:string):ProviderResult=>({status,message,events:[],stop:true,source:'api',stage:'api'});
export function validQuery(uid:string,month:string):boolean {return /^\d{1,10}$/.test(uid) && /^20\d\d-(0[1-9]|1[0-2])$/.test(month);}

/** One instance per Durable Object: all visitors share cache, cooldown and request budget. */
export class MonthlyService {
  private pending=new Map<string,Promise<ProviderResult>>();
  private active=0;
  private queue:Array<()=>void>=[];
  private serial=new Serial();
  private provider:AvailabilityProvider;
  constructor(private store:Store,provider?:AvailabilityProvider,private now=()=>Date.now()) {
    this.provider=provider || sourceProvider({
      get:uid=>this.serial.run(()=>store.get<CalendarMetadata>(`metadata:${uid}`)),
      put:(uid,value)=>this.serial.run(async()=>{
        const key=`metadata:${uid}`,index=await store.get<string[]>('metadata-index') || [];
        const ordered=[...index.filter(k=>k!==key),key];
        while(ordered.length>256) await store.delete(ordered.shift()!);
        await store.put(key,value);await store.put('metadata-index',ordered);
      }),
      delete:uid=>this.serial.run(async()=>{await store.delete(`metadata:${uid}`);}),
    });
  }
  query(uid:string,month:string):Promise<ProviderResult> {
    if(!validQuery(uid,month)) return Promise.resolve(apiFailure('PARSER_UNSUPPORTED','선박 UID 또는 조회 월이 올바르지 않습니다.'));
    // Invalidate old species classifications without resetting request budgets or cooldowns.
    const key=`month:species-v3:${uid}:${month}`,pending=this.pending.get(key);if(pending) return pending;
    const promise=this.run(uid,month,key).finally(()=>this.pending.delete(key));this.pending.set(key,promise);return promise;
  }
  private async acquire():Promise<boolean> {
    if(this.active<3) {this.active++;return true;}
    if(this.queue.length>=9) return false;
    await new Promise<void>(resolve=>this.queue.push(resolve));return true;
  }
  private release() {const next=this.queue.shift();if(next) next();else this.active--;}
  private async cached(key:string):Promise<ProviderResult|undefined> {
    const limits=await this.store.get<Limits>('limits');
    if(limits && limits.blockedUntil>this.now() && limits.block) return {...limits.block,cached:true};
    const entry=await this.store.get<Entry>(key);
    if(entry && entry.expires>this.now()) return {...entry.result,cached:true};
  }
  private async run(uid:string,month:string,key:string):Promise<ProviderResult> {
    const cached=await this.serial.run(()=>this.cached(key));if(cached) return cached;
    if(!await this.acquire()) return apiFailure('API_BUSY','조회 서버가 혼잡합니다. 잠시 후 다시 조회하세요.');
    try {
      while(true) {
        const admission=await this.serial.run(async():Promise<ProviderResult|{waitMs:number}|undefined>=>{
          const cached=await this.cached(key);if(cached) return cached;
          const now=this.now(),limits=await this.store.get<Limits>('limits') || {windowStart:now,count:0,blockedUntil:0};
          if(now-limits.windowStart>=60000) {limits.windowStart=now;limits.count=0;}
          // Metadata hits need one request. The provider still admits at most one source request/second.
          if(limits.count>=60) {
            const waitMs=limits.windowStart+60000-now;
            // Normal long batches reserve a few slots ahead of the source pacer.
            if(waitMs<=5000) return {waitMs};
            return apiFailure('API_BUSY','조회 서버의 분당 처리량에 도달했습니다. 잠시 후 다시 조회하세요.');
          }
          limits.count++;await this.store.put('limits',limits);
        });
        if(admission && 'waitMs' in admission) {await waitFor(admission.waitMs,new AbortController().signal);continue;}
        if(admission) return admission;
        break;
      }
      const boat={uid,name:'',port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`};
      const read=await this.provider.readMonth(boat,month,new AbortController().signal);
      const result:ProviderResult={...read,source:'api',events:read.events.map(e=>({...e,source:'api'}))};
      if(result.status==='ALLOWED_READABLE') result.message=`${result.events.length}개 출조 상품을 조회 서버에서 확인했습니다.`;
      if(result.status==='NETWORK_OR_CORS') result.message='조회 서버가 더피싱 응답을 받지 못했습니다. 원본 서버 연결 상태를 확인해야 합니다.';
      await this.serial.run(async()=>{
        if(['AUTH_OR_COOKIE_BLOCKED','ACCESS_RESTRICTED','NETWORK_OR_CORS','TIMEOUT'].includes(result.status)) {
          const limits=await this.store.get<Limits>('limits') || {windowStart:this.now(),count:0,blockedUntil:0};
          const until=this.now()+(['AUTH_OR_COOKIE_BLOCKED','ACCESS_RESTRICTED'].includes(result.status) ? 600000:30000);
          if(until>limits.blockedUntil) {limits.blockedUntil=until;limits.block={...result,stop:true};await this.store.put('limits',limits);}
        }
        // Only normalized public data is stored, never original HTML or request headers.
        if(new TextEncoder().encode(JSON.stringify(result)).length<120000) {
          const index=await this.store.get<string[]>('cache-index') || [],ordered=[...index.filter(k=>k!==key),key];
          while(ordered.length>256) await this.store.delete(ordered.shift()!);
          await this.store.put(key,{expires:this.now()+(result.status==='ALLOWED_READABLE' ? 600000:60000),result});
          await this.store.put('cache-index',ordered);
        }
      });
      return result;
    } finally {this.release();}
  }
}
