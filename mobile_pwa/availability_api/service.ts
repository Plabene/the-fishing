import { parseHTML } from 'linkedom';
import { TheFishingDirect } from '../src/providers/thefishingDirect';
import type { AvailabilityProvider, ProviderResult } from '../src/provider';

export interface Store {
  get<T>(key:string):Promise<T|undefined>;
  put<T>(key:string,value:T):Promise<unknown>;
  delete(key:string):Promise<unknown>;
}
interface Limits {windowStart:number;count:number;blockedUntil:number;block?:ProviderResult}
interface Entry {expires:number;result:ProviderResult}
export function sourceProvider():AvailabilityProvider {
  const dom=parseHTML('<!doctype html><html><body></body></html>').document as unknown as Document;
  // Workers support manual/follow redirects. Never follow: the provider rejects every non-200 response.
  return new TheFishingDirect((input,init)=>fetch(input,{...init,redirect:'manual'}),1000,10000,dom);
}
export const apiFailure=(status:ProviderResult['status'],message:string):ProviderResult=>({status,message,events:[],stop:true,source:'api',stage:'api'});
export function validQuery(uid:string,month:string):boolean {return /^\d{1,10}$/.test(uid) && /^20\d\d-(0[1-9]|1[0-2])$/.test(month);}

/** One instance per Durable Object: all visitors share cache, cooldown and request budget. */
export class MonthlyService {
  private active: {key:string;promise:Promise<ProviderResult>} | null=null;
  constructor(private store:Store,private provider:AvailabilityProvider=sourceProvider(),private now=()=>Date.now()) {}
  query(uid:string,month:string):Promise<ProviderResult> {
    if(!validQuery(uid,month)) return Promise.resolve(apiFailure('PARSER_UNSUPPORTED','선박 UID 또는 조회 월이 올바르지 않습니다.'));
    const key=`month:${uid}:${month}`;
    if(this.active) return this.active.key===key ? this.active.promise : Promise.resolve(apiFailure('API_BUSY','다른 조회가 진행 중입니다. 잠시 후 다시 조회하세요.'));
    const promise=this.run(uid,month,key).finally(()=>{this.active=null;});
    this.active={key,promise}; return promise;
  }
  private async run(uid:string,month:string,key:string):Promise<ProviderResult> {
    const now=this.now();
    const limits=await this.store.get<Limits>('limits') || {windowStart:now,count:0,blockedUntil:0};
    if(limits.blockedUntil>now) return {...limits.block!,cached:true};
    const entry=await this.store.get<Entry>(key);
    if(entry && entry.expires>now) return {...entry.result,cached:true};
    if(now-limits.windowStart>=60000) {limits.windowStart=now;limits.count=0;}
    if(limits.count>=30) return apiFailure('API_BUSY','조회 서버의 분당 처리량에 도달했습니다. 잠시 후 다시 조회하세요.');
    limits.count++;await this.store.put('limits',limits);
    const boat={uid,name:'',port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`};
    const read=await this.provider.readMonth(boat,month,new AbortController().signal);
    const result:ProviderResult={...read,source:'api',events:read.events.map(e=>({...e,source:'api'}))};
    if(result.status==='ALLOWED_READABLE') result.message=`${result.events.length}개 출조 상품을 조회 서버에서 확인했습니다.`;
    if(result.status==='NETWORK_OR_CORS') result.message='조회 서버가 더피싱 응답을 받지 못했습니다. 원본 서버 연결 상태를 확인해야 합니다.';
    if(['AUTH_OR_COOKIE_BLOCKED','ACCESS_RESTRICTED','NETWORK_OR_CORS','TIMEOUT'].includes(result.status)) {
      limits.blockedUntil=this.now()+(['AUTH_OR_COOKIE_BLOCKED','ACCESS_RESTRICTED'].includes(result.status) ? 600000:30000);
      limits.block={...result,stop:true};await this.store.put('limits',limits);
    }
    // Store only public normalized fields, never original HTML, cookies or request headers.
    if(new TextEncoder().encode(JSON.stringify(result)).length<120000) {
      const index=await this.store.get<string[]>('cache-index') || [];
      const ordered=[...index.filter(k=>k!==key),key];
      while(ordered.length>256) await this.store.delete(ordered.shift()!);
      await this.store.put(key,{expires:this.now()+(result.status==='ALLOWED_READABLE' ? 600000:60000),result});
      await this.store.put('cache-index',ordered);
    }
    return result;
  }
}
