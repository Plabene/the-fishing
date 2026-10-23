import type {Boat} from '../models';
import type {AvailabilityProvider,ProviderResult} from '../provider';
import {apiOrigin,requestJson,validateApiResult} from './thefishingApi';
import {sunsangListing} from '../platforms';
import {publicRouteForBoat,SUNSANG_PUBLIC_UNMAPPED} from '../sunsang24PublicRoutes';

const unavailable=(message:string,status:ProviderResult['status']='API_UNAVAILABLE'):ProviderResult=>({status,message,events:[],source:'api',stage:'api',stop:false});
/** A new instance per query button. Sibling vessels share one fresh homepage response in that run. */
export class Sunsang24PublicApi implements AvailabilityProvider {
  private pages=new Map<string,Promise<unknown>>();
  constructor(private origin:string,private request:typeof fetch=(...args)=>fetch(...args)) {}
  async readMonth(boat:Boat,month:string,signal:AbortSignal):Promise<ProviderResult> {
    signal.throwIfAborted();
    const route=publicRouteForBoat(boat.uid),listing=sunsangListing(boat.uid);
    if(!route || !listing) return unavailable(SUNSANG_PUBLIC_UNMAPPED,'UNSUPPORTED_SOURCE');
    if(!this.origin) return unavailable('조회 API를 먼저 연결하세요.','API_NOT_CONFIGURED');
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return unavailable('조회 월을 확인하세요.','PARSER_UNSUPPORTED');
    try {
      const key=`${route.host}:${month}`;
      if(!this.pages.has(key)) this.pages.set(key,requestJson(this.request,`${apiOrigin(this.origin)}/v1/sunsang24/public-month?ship=${listing.shipId}&month=${month}&fresh=1`,AbortSignal.any([signal,AbortSignal.timeout(30000)])));
      const data=await this.pages.get(key) as Record<string,unknown>;signal.throwIfAborted();
      if(data?.status==='ALLOWED_READABLE') {
        if(data.host!==route.host || data.month!==month || !Array.isArray(data.shipIds) || !Array.isArray(data.events) || data.events.length>2000 || data.shipIds.some(id=>typeof id!=='string' || !route.ships.includes(id))) throw new Error('요청한 공개 예약표와 응답이 다릅니다.');
        if(!data.shipIds.includes(listing.shipId)) return unavailable('공개 예약표에서 이 선박의 해당 월 일정을 확인하지 못했습니다. 공식 페이지에서 확인하세요.','UNVERIFIED');
        if(!data.fresh || data.cached) throw new Error('새 원본 조회가 아닙니다.');
      }
      const rows=Array.isArray(data?.events)?data.events.filter(e=>(e as {uid?:unknown})?.uid===`sunsang24:ship:${listing.shipId}`):[];
      return validateApiResult({...data,events:rows.map(e=>({...e,uid:boat.uid}))},boat,month);
    } catch(error) {if(signal.aborted) throw error;return unavailable(`선상24 조회 실패: ${error instanceof Error?error.message:'응답 확인 불가'}`);}
  }
}
