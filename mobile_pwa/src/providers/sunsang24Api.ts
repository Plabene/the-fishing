import type {Boat} from '../models';
import type {AvailabilityProvider,ProviderResult} from '../provider';
import {apiOrigin,requestJson,validateApiResult} from './thefishingApi';
import {boatPlatform,sunsangListing,SUNSANG24_LIVE_ENABLED,SUNSANG24_DISABLED_MESSAGE} from '../platforms';

const unavailable=(message:string,status:ProviderResult['status']='API_UNAVAILABLE',stop=false):ProviderResult=>({status,message,events:[],source:'api',stage:'api',stop});
/** Create once per button click. Area results are shared only inside that run. */
export class Sunsang24Api implements AvailabilityProvider {
  private areas=new Map<string,Promise<unknown>>();
  constructor(private origin:string,private request:typeof fetch=fetch,private enabled=SUNSANG24_LIVE_ENABLED) {}
  async readMonth(boat:Boat,month:string,signal:AbortSignal):Promise<ProviderResult> {
    signal.throwIfAborted();
    if(!this.enabled) return unavailable(SUNSANG24_DISABLED_MESSAGE,'PERMISSION_DENIED');
    const listing=sunsangListing(boat.uid);
    if(!listing?.areaId) return unavailable('선상24의 정확한 조회 지역 코드가 확인되지 않았습니다. 공식 페이지를 이용하세요.','UNSUPPORTED_SOURCE');
    try {
      const key=`${listing.areaId}:${month}`;
      if(!this.areas.has(key)) this.areas.set(key,requestJson(this.request,`${apiOrigin(this.origin)}/v1/sunsang24/month?area=${listing.areaId}&month=${month}&fresh=1`,AbortSignal.any([signal,AbortSignal.timeout(30000)])));
      const data=await this.areas.get(key) as Record<string,unknown>;
      signal.throwIfAborted();
      if(data.status==='ALLOWED_READABLE' && (data.area!==listing.areaId || data.month!==month || !Array.isArray(data.events) || data.events.length>3000)) throw new Error('지역 응답이 요청과 다릅니다.');
      const rows=Array.isArray(data.events) ? data.events.filter(e=>(e as {uid?:unknown})?.uid===`sunsang24:ship:${listing.shipId}`):[];
      const result=validateApiResult({...data,events:rows.map(e=>({...e,uid:boat.uid}))},boat,month);
      if(result.status==='ALLOWED_READABLE' && (!result.fresh || result.cached)) throw new Error('새 원본 조회가 아닙니다.');
      return result;
    } catch(error) {if(signal.aborted) throw error;return unavailable(`선상24 조회 실패: ${error instanceof Error ? error.message:'응답 확인 불가'}`,'API_UNAVAILABLE',true);}
  }
}
export class IntegratedProvider implements AvailabilityProvider {
  constructor(private thefishing:AvailabilityProvider,private sunsang:AvailabilityProvider) {}
  readMonth(boat:Boat,month:string,signal:AbortSignal) {return (boatPlatform(boat)==='sunsang24' ? this.sunsang:this.thefishing).readMonth(boat,month,signal);}
}
