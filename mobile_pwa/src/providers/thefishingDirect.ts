import { classifyProbe, type AvailabilityProvider, type ProviderResult } from '../provider';
import { officialDetail, type Boat } from '../models';
import { calendarEndpoint, discoverCalendar, parseCalendar, securityDocument } from './thefishingParser';
export interface CalendarMetadata {endpoint:string;st_uid:string;pa_uid:string;expires:number}
export interface MetadataCache {get(uid:string):Promise<CalendarMetadata|undefined>;put(uid:string,value:CalendarMetadata):Promise<void>;delete(uid:string):Promise<void>}

export class ReadError extends Error {
  constructor(readonly result:ProviderResult) {super(result.message);}
}
const fail=(status:ProviderResult['status'],message:string,stop=false,extra:Partial<ProviderResult>={}):ProviderResult=>({status,message,events:[],stop,...extra});
export function waitFor(ms:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(new DOMException('취소되었습니다.','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,ms));
    signal.addEventListener('abort',abort,{once:true});
  });
}
export class TheFishingDirect implements AvailabilityProvider {
  private lastRequest=0;
  private running=new Set<string>();
  private admission:Promise<void>=Promise.resolve();
  private blockedUntil=0;
  private blockResult:ProviderResult|undefined;
  private metadata=new Map<string,CalendarMetadata>();
  constructor(private request:typeof fetch=(...args)=>fetch(...args),private gapMs=1000,private timeoutMs=15000,private dom:Document=globalThis.document,private metadataCache?:MetadataCache,private metadataTtlMs=3600000,private isolateTransient=false) {}
  private async admit(signal:AbortSignal) {
    const previous=this.admission;let release!:()=>void;this.admission=new Promise<void>(resolve=>{release=resolve;});
    await previous;
    try {
      await waitFor(this.lastRequest+this.gapMs-Date.now(),signal);
      if(this.blockedUntil>Date.now() && this.blockResult) throw new ReadError(this.blockResult);
      signal.throwIfAborted();this.lastRequest=Date.now();
    } finally {release();}
  }
  validateDetail(url:string):boolean {return !!officialDetail(url);}
  private async html(url:string,stage:'detail'|'calendar',signal:AbortSignal,body?:URLSearchParams):Promise<string> {
    if(stage==='detail' ? !officialDetail(url) : !calendarEndpoint(url)) throw new Error('허용되지 않은 주소입니다.');
    await this.admit(signal);
    signal.throwIfAborted();
    const controller=new AbortController(), abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.request(url,{method:body ? 'POST':'GET',body,mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,
        headers:body ? {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-Requested-With':'XMLHttpRequest'} : undefined});
      if(response.type==='opaque' || response.type==='opaqueredirect') throw new ReadError(fail('NETWORK_OR_CORS','응답 본문을 읽을 수 없습니다. CORS 또는 네트워크 조건을 확인하세요.',true,{stage}));
      if(response.status!==200) {
        const status=classifyProbe({status:response.status});
        throw new ReadError(fail(status,`HTTP ${response.status} · ${stage==='detail' ? '선박 상세':'월 달력'} 조회 실패${response.status===404 ? ' (주소 없음 또는 접근 응답)':''}`,status==='ACCESS_RESTRICTED' || status==='AUTH_OR_COOKIE_BLOCKED',{httpStatus:response.status,stage}));
      }
      const contentType=response.headers.get('content-type') || '';
      if(contentType && !/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType)) throw new ReadError(fail('PARSER_UNSUPPORTED','달력 HTML 응답이 아닙니다.',false,{stage}));
      const reader=response.body?.getReader(), chunks:Uint8Array[]=[];let size=0;
      if(!reader) throw new ReadError(fail('PARSER_UNSUPPORTED','달력 응답 본문이 없습니다.',false,{stage}));
      while(true) {
        const chunk=await reader.read();if(chunk.done) break;
        size+=chunk.value.byteLength;
        if(size>2_000_000) {await reader.cancel();throw new ReadError(fail('PARSER_UNSUPPORTED','달력 응답이 허용 크기를 초과했습니다.',false,{stage}));}
        chunks.push(chunk.value);
      }
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const prefix=new TextDecoder().decode(bytes.slice(0,4096));
      const encoding=(contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || prefix.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const charset=['euc-kr','cp949','windows-949','ks_c_5601-1987'].includes(encoding) ? 'euc-kr' : ['utf-8','utf8'].includes(encoding) ? 'utf-8' : '';
      if(!charset) throw new ReadError(fail('PARSER_UNSUPPORTED','지원하지 않는 응답 문자 인코딩입니다.',false,{stage}));
      const html=new TextDecoder(charset).decode(bytes);
      if(securityDocument(html,this.dom)) throw new ReadError(fail('ACCESS_RESTRICTED','사이트가 보안 확인 또는 접근 제한 화면을 반환했습니다.',true,{stage}));
      return html;
    } catch(error) {
      if(signal.aborted) throw new DOMException('취소되었습니다.','AbortError');
      if(error instanceof ReadError) throw error;
      throw new ReadError(fail(controller.signal.aborted ? 'TIMEOUT':'NETWORK_OR_CORS',controller.signal.aborted ? '조회 응답 시간이 초과되었습니다.' : '브라우저에서 응답을 읽지 못했습니다. CORS·네트워크·리디렉션 중 정확한 원인은 확인되지 않았습니다.',!this.isolateTransient,{stage}));
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async readMonth(boat:Boat,month:string,signal:AbortSignal):Promise<ProviderResult> {
    signal.throwIfAborted();
    if(!officialDetail(boat.url,boat.uid)) return fail('UNSUPPORTED_SOURCE','이 선박은 직접 조회를 지원하지 않습니다. 공식 페이지를 이용하세요.');
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return fail('PARSER_UNSUPPORTED','조회 월을 확인하세요.');
    const key=`${boat.uid}:${month}`;
    if(this.running.has(key)) return fail('UNVERIFIED','이미 조회 중입니다.',true);
    if(this.blockedUntil>Date.now() && this.blockResult) return this.blockResult;
    this.running.add(key);
    try {
      let metadata=this.metadata.get(boat.uid) || await this.metadataCache?.get(boat.uid);
      if(!metadata || metadata.expires<=Date.now() || metadata.pa_uid!==boat.uid || !/^\d+$/.test(metadata.st_uid)) {
        const detail=await this.html(boat.url,'detail',signal);
        metadata={...discoverCalendar(detail,boat),expires:Date.now()+this.metadataTtlMs};
        await this.metadataCache?.put(boat.uid,metadata);
      }
      const {endpoint,st_uid,pa_uid}=metadata;calendarEndpoint(endpoint);
      this.metadata.set(boat.uid,metadata);while(this.metadata.size>256) this.metadata.delete(this.metadata.keys().next().value!);
      const html=await this.html(endpoint,'calendar',signal,new URLSearchParams({date6:month.replace('-',''),st_uid,pa_uid}));
      signal.throwIfAborted(); const observedAt=new Date().toISOString();
      const events=await parseCalendar(html,boat,month,observedAt,this.dom); signal.throwIfAborted();
      return {status:'ALLOWED_READABLE',events,observedAt,fresh:true,cached:false,message:`${events.length}개 출조 상품을 직접 조회했습니다.`};
    } catch(error) {
      if(signal.aborted) throw new DOMException('취소되었습니다.','AbortError');
      const result=error instanceof ReadError ? error.result : fail('PARSER_UNSUPPORTED',error instanceof Error ? error.message : '달력 응답을 해석하지 못했습니다.');
      if(['ACCESS_RESTRICTED','AUTH_OR_COOKIE_BLOCKED',...(!this.isolateTransient?['NETWORK_OR_CORS','TIMEOUT']:[])].includes(result.status)) {
        this.blockedUntil=Date.now()+(['ACCESS_RESTRICTED','AUTH_OR_COOKIE_BLOCKED'].includes(result.status) ? 600000:30000);this.blockResult={...result,stop:true};
      }
      this.metadata.delete(boat.uid);await this.metadataCache?.delete(boat.uid);
      return result;
    } finally {this.running.delete(key);}
  }
}
