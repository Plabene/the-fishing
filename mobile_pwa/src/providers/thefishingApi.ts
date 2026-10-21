import { dateOnly, officialDetail, text, timestamp, type Boat, type Observation } from '../models';
import type { AvailabilityProvider, ProviderResult } from '../provider';
import defaultEndpoint from '../data/apiEndpoint.json';

const key='thefishing-availability-api';
export function apiOrigin(value:string):string {
  const url=new URL(value.trim());
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new Error('Cloudflare 배포 후 받은 https://서비스명.계정명.workers.dev 주소를 입력하세요.');
  return url.origin;
}
export function loadApiOrigin():string {
  try {const value=localStorage.getItem(key) ?? (import.meta.env.VITE_AVAILABILITY_API_URL || defaultEndpoint.url);return value ? apiOrigin(value):'';} catch {return '';}
}
export function saveApiOrigin(value:string):void {localStorage.setItem(key,apiOrigin(value));}
export function clearApiOrigin():void {localStorage.setItem(key,'');}
const failure=(message:string,status:ProviderResult['status']='API_UNAVAILABLE'):ProviderResult=>({status,message,events:[],stop:true,stage:'api',source:'api'});
async function requestJson(request:typeof fetch,url:string,signal:AbortSignal):Promise<unknown> {
  const response=await request(url,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal});
  if(!response.ok) throw new Error(`조회 API HTTP ${response.status}`);
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('조회 API의 JSON 응답이 아닙니다.');
  const body=await response.text();if(body.length>2000000) throw new Error('조회 API 응답이 너무 큽니다.');
  return JSON.parse(body);
}
export async function checkApi(value:string,request:typeof fetch=fetch):Promise<string> {
  const origin=apiOrigin(value), data=await requestJson(request,origin+'/health',AbortSignal.timeout(10000)) as Record<string,unknown>;
  if(data?.service!=='thefishing-availability' || data.schema!==1 || data.ready!==true) throw new Error('호환되는 조회 API가 아닙니다.');
  return origin;
}
const accepted=new Set(['ALLOWED_READABLE','HTTP_ERROR','ACCESS_RESTRICTED','AUTH_OR_COOKIE_BLOCKED','PARSER_UNSUPPORTED','UNSUPPORTED_SOURCE','NETWORK_OR_CORS','TIMEOUT','API_UNAVAILABLE','API_BUSY','UNVERIFIED']);
export function validateApiResult(value:unknown,boat:Boat,month:string):ProviderResult {
  if(!value || typeof value!=='object') throw new Error('올바르지 않은 조회 응답입니다.');
  const data=value as Record<string,unknown>;
  if(!accepted.has(String(data.status)) || !Array.isArray(data.events)) throw new Error('조회 상태 형식을 확인할 수 없습니다.');
  if(data.status!=='ALLOWED_READABLE') return {...failure(text(data.message,500) || '조회 실패',data.status as ProviderResult['status']),
    stop:data.stop!==false,stage:['detail','calendar'].includes(String(data.stage)) ? data.stage as 'detail'|'calendar':'api',
    httpStatus:Number.isInteger(data.httpStatus) && Number(data.httpStatus)>=100 && Number(data.httpStatus)<=599 ? Number(data.httpStatus):undefined};
  const observedAt=timestamp(data.observedAt);
  if(!observedAt || Date.now()-Date.parse(observedAt)>660000 || data.events.length>2000) throw new Error('조회 시각 또는 결과 범위를 확인할 수 없습니다.');
  const seen=new Set<string>();
  const events:Observation[]=data.events.map((item:unknown)=>{
    if(!item || typeof item!=='object') throw new Error('잘못된 출조 상품입니다.');
    const row=item as Record<string,unknown>,date=dateOnly(row.date);
    if(row.uid!==boat.uid || !date?.startsWith(month+'-') || row.observedAt!==observedAt || typeof row.id!=='string' || !/^direct-[a-f0-9]{24}$/.test(row.id) || seen.has(row.id)) throw new Error('선박·월·상품 정보가 요청과 일치하지 않습니다.');
    seen.add(row.id);
    const count=row.remaining;
    if(count!==null && (!Number.isInteger(count) || Number(count)<0 || Number(count)>10000)) throw new Error('잔여석을 확인할 수 없습니다.');
    if(row.price!==null && row.price!==undefined && (!Number.isInteger(row.price) || Number(row.price)<0 || Number(row.price)>100000000)) throw new Error('요금을 확인할 수 없습니다.');
    const departure=typeof row.departure==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.departure) ? row.departure:'';
    return {id:row.id,uid:boat.uid,date,trip:text(row.trip),port:boat.port,departure,remaining:count as number|null,price:row.price==null ? null:Number(row.price),observedAt,verified:true,source:'api'};
  });
  return {status:'ALLOWED_READABLE',message:`${events.length}개 출조 상품을 API로 확인했습니다.${data.cached===true ? ' (10분 이내 저장 응답)':''}`,events,observedAt,source:'api',cached:data.cached===true};
}
export class TheFishingApi implements AvailabilityProvider {
  constructor(private origin:string,private request:typeof fetch=(...args)=>fetch(...args)) {if(origin) this.origin=apiOrigin(origin);}
  async readMonth(boat:Boat,month:string,signal:AbortSignal):Promise<ProviderResult> {
    if(!this.origin) return failure('조회 API를 먼저 연결하세요.','API_NOT_CONFIGURED');
    if(!officialDetail(boat.url,boat.uid)) return {...failure('이 선박은 API 조회를 지원하지 않습니다. 공식 페이지를 이용하세요.','UNSUPPORTED_SOURCE'),stop:false};
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return failure('조회 월을 확인하세요.','PARSER_UNSUPPORTED');
    signal.throwIfAborted();
    try {
      const combined=AbortSignal.any([signal,AbortSignal.timeout(30000)]);
      return validateApiResult(await requestJson(this.request,`${this.origin}/v1/month?uid=${boat.uid}&month=${month}`,combined),boat,month);
    } catch(error) {if(signal.aborted) throw error;return failure(`조회 API 연결 또는 응답 확인에 실패했습니다. ${error instanceof Error ? error.message:''}`);}
  }
}
