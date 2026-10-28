import {robotsAllows} from '../scripts/lib/robots.mjs';
export {robotsAllows} from '../scripts/lib/robots.mjs';
import {parseHTML} from 'linkedom';
import {dateOnly,text,type Observation} from '../src/models';
import {eventSpecies,speciesLabel} from '../src/species';
import {SUNSANG_PUBLIC_ROUTES,publicRouteForShip,reviewedPublicHost,SUNSANG_PUBLIC_UNMAPPED} from '../src/sunsang24PublicRoutes';
import type {ProviderResult} from '../src/provider';
import {apiFailure,validQuery,type Store} from './service';
import {scheduleStatus} from './sunsang24';
import sources from '../src/data/sunsang24CatalogSources.json';
import {parsePublicFleet,type PublicFleetSource,type PublicFleetBoat} from '../scripts/lib/public-fleet.mjs';
export const PUBLIC_CATALOG_SOURCES=new Map<string,PublicFleetSource>(sources.sources.map(s=>[s.host,s]));
type PublicCatalogReply={status:'OK';host:string;observedAt:string;cached:boolean;boats:PublicFleetBoat[]}|{status:'UNAVAILABLE';message:string};

const AGENT='TheFishingAvailability';
const UA=`${AGENT}/1.0 (+https://github.com/Plabene/the-fishing)`;
type PublicResult=ProviderResult & {host?:string;month?:string;shipIds?:string[];shipFailures?:Array<{shipId:string;message:string}>;unpublishedDates?:Array<{shipId:string;date:string}>};
class SourceFailure extends Error {constructor(message:string,readonly status:ProviderResult['status'],readonly httpStatus?:number) {super(message);}}
const failure=(status:ProviderResult['status'],message:string):PublicResult=>({...apiFailure(status,message),stage:'calendar',stop:false});

/** Port the PC's ship_unit/date/fish/remaining selectors; never read reservation names or memos. */
export function parsePublicMonth(html:string,host:string,month:string,observedAt:string):PublicResult {
  const route=SUNSANG_PUBLIC_ROUTES.get(host);if(!reviewedPublicHost(host) || !validQuery('1',month)) throw new Error('확인되지 않은 공개 예약표');
  const {document}=parseHTML(html),nav=document.querySelector('.month_nav')?.textContent || '';
  const ym=/(20\d\d)년\s*(\d{1,2})월/.exec(nav);
  if(!ym || `${ym[1]}-${ym[2].padStart(2,'0')}`!==month) throw new Error('원본 예약표의 조회 월이 다릅니다.');
  // Operator notices can embed copied old calendar HTML, including schedule IDs and seat counts.
  // Remove those rich-text subtrees before selecting any structured reservation fields.
  document.querySelectorAll('.small_event,.editor_memo_pc,.editor_memo_mobile').forEach(node=>node.remove());
  const declared=new Set([...document.querySelectorAll('button.btn-schedule-ship[data-ship-list-no]')].map(n=>n.getAttribute('data-ship-list-no') || '').filter(id=>/^[1-9]\d{0,9}$/.test(id)));
  const allowed=new Set([...(route?.ships || []),...declared]);
  const events:Observation[]=[],shipIds=new Set<string>(),seen=new Map<string,string>(),broken=new Map<string,string>(),unpublishedDates:Array<{shipId:string;date:string}>=[];
  for(const table of document.querySelectorAll('table.ship_unit')) {
    const ship=/(?:^|\s)ship_unit_ship_no_(\d+)(?:\s|$)/.exec(table.className)?.[1];
    if(!ship) throw new Error('일정의 선박 식별자가 없습니다.');
    if(!allowed.has(ship)) continue;
    try {
    const details=table.querySelectorAll('.reservation_detail[data-sdate][data-schedule_no]');
    if(details.length!==1 || !text(table.querySelector('.ship_info .title')?.textContent)) throw new Error('선박 일정 구조가 변경되었습니다.');
    const detail=details[0],date=dateOnly(detail.getAttribute('data-sdate')),schedule=detail.getAttribute('data-schedule_no') || '';
    if(!date?.startsWith(month+'-') || !/^\d{1,20}$/.test(schedule)) throw new Error('출항일 또는 일정 식별자가 일치하지 않습니다.');
    for(const button of table.querySelectorAll('button[data-schedule_no]')) {
      if(button.getAttribute('data-schedule_no')!==schedule || button.hasAttribute('data-sdate') && button.getAttribute('data-sdate')!==date || button.hasAttribute('data-ship_no') && button.getAttribute('data-ship_no')!==ship) throw new Error('예약 버튼의 선박·날짜·일정이 다릅니다.');
    }
    // Observed across multiple regions: unpublished days use schedule_no=0 with empty fields.
    // They are not duplicate trips, bookable seats, cancellations or a transport failure.
    if(schedule==='0') {
      const remain=table.querySelectorAll('.ship_info2 .remain');
      if(remain.length!==1 || text(remain[0].textContent) || text(table.querySelector('.fishspecies #fish')?.textContent) || text(table.querySelector('.shiptime .detail')?.textContent) || remain[0].querySelector('[data-status_code]')?.getAttribute('data-status_code')) throw new Error('미등록 일정에 예약 정보가 있어 검증할 수 없습니다.');
      unpublishedDates.push({shipId:ship,date});shipIds.add(ship);continue;
    }
    if(seen.has(schedule)) {broken.set(seen.get(schedule)!,'중복 일정 식별자');throw new Error('중복 일정 식별자');}
    seen.set(schedule,ship);
    const remain=table.querySelectorAll('.ship_info2 .remain');
    if(remain.length!==1) throw new Error('예약 상태 영역을 확인하지 못했습니다.');
    const value=remain[0],label=text(value.textContent,160).replace(/\s+/g,' ');
    const shipping=value.querySelector('.shipping_status'),code=shipping?.getAttribute('data-status_code');
    const action=table.querySelector('.btn_user_reservation[data-ship_status_code]');
    const seats=/^(?:출항확정\s*)?남은자리\s*(\d+)명(?:\s|예약|$)/.exec(label);
    let remaining=seats?Number(seats[1]):null;
    if(remaining!==null && remaining>10000) throw new Error('잔여석 범위 변경');
    // Closed/cancelled/telephone-only cards can contain capacity and booked counts. They are NOT seats.
    const reservationStatus=code?scheduleStatus(code,shipping?.textContent):seats && action?.getAttribute('data-ship_status_code')==='ING'?'available':scheduleStatus('',shipping?.textContent);
    if(reservationStatus!=='available') remaining=null;
    const trip=text(table.querySelector('.fishspecies #fish')?.textContent) || '출조 정보 미표시';
    const speciesKey=eventSpecies({trip}),time=text(table.querySelector('.shiptime .detail')?.textContent);
    const departure=/^(?:[01]\d|2[0-3]):[0-5]\d/.exec(time)?.[0] || '';
    events.push({id:`sunsang24-schedule-${schedule}`,uid:`sunsang24:ship:${ship}`,date,trip,speciesKey,species:speciesLabel(speciesKey),departure,port:'',price:null,remaining,
      verified:reservationStatus!=='unknown',reservationStatus,reservationStatusLabel:text(shipping?.textContent) || (seats?'예약가능':'상태 미확인'),
      reservationUrl:`https://www.sunsang24.com/ship/list?ship_no=${ship}&sdate=${date}`,observedAt,source:'api'});
    shipIds.add(ship);
    } catch(error) {broken.set(ship,error instanceof Error?error.message:'일정 구조 확인 실패');}
  }
  // A malformed vessel must never erase valid sibling schedules. Do not publish partial seats for the broken vessel.
  const valid=events.filter(e=>!broken.has(e.uid.replace('sunsang24:ship:','')));
  if(!valid.length && !shipIds.size || events.length>2000 || unpublishedDates.length>10000) throw new Error('해당 월의 선박 일정을 확인하지 못했습니다. 공식 페이지에서 확인하세요.');
  // Explicit fleet navigation + a verified month containing valid cards establishes an empty sibling calendar.
  // A wholly empty/unrecognized document is still unverified, never invented as a successful empty month.
  if(valid.length) for(const id of declared) shipIds.add(id);
  for(const id of broken.keys()) shipIds.delete(id);
  if(!shipIds.size) throw new Error('선박 일정 검증 실패: '+[...broken.values()][0]);
  return {status:'ALLOWED_READABLE',message:`공개 예약표 ${valid.length}개 일정 확인`,events:valid,host,month,shipIds:[...shipIds],shipFailures:[...broken].map(([shipId,message])=>({shipId,message})),unpublishedDates:unpublishedDates.filter(d=>!broken.has(d.shipId)),observedAt,source:'api',fresh:true,cached:false,httpStatus:200};
}

/** No persistent seat cache. Only in-flight responses and access policy metadata are shared. */
export class Sunsang24PublicService {
  private pending=new Map<string,Promise<PublicResult>>();
  private catalogPending=new Map<string,Promise<PublicCatalogReply>>();
  private budgetTail:Promise<unknown>=Promise.resolve();
  constructor(private store:Store,private request:typeof fetch=(...args)=>fetch(...args)) {}
  catalog(host:string):Promise<PublicCatalogReply> {
    const source=PUBLIC_CATALOG_SOURCES.get(host);if(!source) return Promise.resolve({status:'UNAVAILABLE',message:'검증되지 않은 공개 선사 주소'});
    const existing=this.catalogPending.get(host);if(existing) return existing;
    if(this.catalogPending.size>=2) return Promise.resolve({status:'UNAVAILABLE',message:'공개 선사 목록 확인 중'});
    const work=(async():Promise<PublicCatalogReply>=>{
      const key=`public-catalog-v1:${host}:${JSON.stringify(source)}`,cached=await this.store.get<{expires:number;result:PublicCatalogReply}>(key);
      if(cached && cached.expires>Date.now() && cached.result.status==='OK') return {...cached.result,cached:true};
      try {
        const month=new Date(Date.now()+9*3600000).toISOString().slice(0,7),html=await this.readCatalogHtml(host,month),observedAt=new Date().toISOString();
        const boats=parsePublicFleet(html,source,observedAt),result:PublicCatalogReply={status:'OK',host,observedAt,cached:false,boats};
        await this.store.put(key,{expires:Date.now()+86400000,result});return result;
      } catch(error) {return {status:'UNAVAILABLE',message:error instanceof SourceFailure?error.message:'공개 선박 목록·등록 지역을 확인하지 못했습니다. 기존 목록을 유지합니다.'};}
    })().finally(()=>this.catalogPending.delete(host));this.catalogPending.set(host,work);return work;
  }
  private async readCatalogHtml(host:string,month:string):Promise<string> {
    try {return await this.readHtml(host,month);}
    catch(error) {
      const transient=error instanceof TypeError || error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) || error instanceof SourceFailure && error.status==='HTTP_ERROR' && /^공개 예약표 HTTP 50[0234]$/.test(error.message);
      if(!transient) throw error;
      // One retry for a metadata read only; access limits and parser failures never retry.
      return this.readHtml(host,month);
    }
  }
  query(ship:string,month:string,host?:string):Promise<PublicResult> {
    const route=publicRouteForShip(ship);
    const target=host || route?.host;
    if(!target || !reviewedPublicHost(target)) return Promise.resolve(failure('UNSUPPORTED_SOURCE',SUNSANG_PUBLIC_UNMAPPED));
    if(!validQuery('1',month)) return Promise.resolve(failure('PARSER_UNSUPPORTED','조회 월을 확인하세요.'));
    const key=`${target}:${month}`,existing=this.pending.get(key);if(existing) return existing;
    if(this.pending.size>=3) return Promise.resolve(failure('API_BUSY','선상24 조회 서버가 혼잡합니다. 잠시 후 다시 조회하세요.'));
    const pending=this.read(target,month).finally(()=>this.pending.delete(key));this.pending.set(key,pending);return pending;
  }
  private async reserve(host:string):Promise<void> {
    const pending=this.budgetTail.then(async()=>{
      const now=Date.now(),old=await this.store.get<{at:number;count:number;hosts:Record<string,number>}>('publicBudget');
      const budget=old && now-old.at<60000?old:{at:now,count:0,hosts:{}};
      if(budget.count>=120 || (budget.hosts[host] || 0)>=12) throw new SourceFailure('원본 요청 한도에 도달했습니다. 잠시 후 다시 조회하세요.','API_BUSY');
      budget.count++;budget.hosts[host]=(budget.hosts[host] || 0)+1;await this.store.put('publicBudget',budget);
    });this.budgetTail=pending.catch(()=>{});return pending;
  }
  private async get(host:string,path:string,signal:AbortSignal):Promise<Response> {
    await this.reserve(host);signal.throwIfAborted();
    const response=await this.request(`https://${host}${path}`,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',headers:{'User-Agent':UA,Accept:path==='/robots.txt'?'text/plain':'text/html','Cache-Control':'no-cache'},signal});
    if([401,403,429].includes(response.status)) {
      const retry=response.headers.get('Retry-After') || '',seconds=Number(retry),until=Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry);
      await this.store.put(`blocked:${host}`,Math.max(Date.now()+600000,Number.isFinite(until)?until:0));
      await response.body?.cancel();
      throw new SourceFailure(`원본 접근 제한 HTTP ${response.status}. 해당 선사의 조회를 잠시 중지합니다.`,'ACCESS_RESTRICTED',response.status);
    }
    return response;
  }
  private async body(response:Response,max:number):Promise<string> {
    const reader=response.body?.getReader();if(!reader) throw new Error('원본 응답 없음');
    const decoder=new TextDecoder();let count=0,result='';
    try {for(;;) {const part=await reader.read();if(part.done) break;count+=part.value.length;if(count>max) throw new Error('원본 응답 크기 초과');result+=decoder.decode(part.value,{stream:true});}return result+decoder.decode();}
    finally {await reader.cancel();}
  }
  private async readHtml(host:string,month:string,signal=AbortSignal.timeout(25000)):Promise<string> {
      if((await this.store.get<number>(`blocked:${host}`) || 0)>Date.now()) throw new SourceFailure('해당 선사의 원본 접근 제한이 해제될 때까지 조회를 중지합니다.','ACCESS_RESTRICTED');
      const path='/ship/schedule_fleet/'+month.replace('-','');
      let policy=await this.store.get<{at:number;body:string}>(`robots:${host}`);
      if(!policy || Date.now()-policy.at>=3600000) {
        const response=await this.get(host,'/robots.txt',signal);
        if(![200,404].includes(response.status)) throw new SourceFailure('공개 페이지의 접근 정책을 확인하지 못했습니다.','HTTP_ERROR');
        policy={at:Date.now(),body:response.status===404?'':await this.body(response,100000)};
        await this.store.put(`robots:${host}`,policy);
      }
      if(!robotsAllows(policy.body,path)) throw new SourceFailure('해당 선사 홈페이지의 접근 정책에 따라 자동 조회를 중지했습니다. 공식 페이지에서 확인하세요.','PERMISSION_DENIED');
      const response=await this.get(host,path,signal);
      if(response.status!==200) {await response.body?.cancel();throw new SourceFailure(`공개 예약표 HTTP ${response.status}`,'HTTP_ERROR',response.status);}
      if(!response.headers.get('content-type')?.includes('text/html')) throw new Error('공개 예약표 HTML이 아닙니다.');
      return this.body(response,12000000);
  }
  private async read(host:string,month:string):Promise<PublicResult> {
    try {
      const signal=AbortSignal.timeout(25000);
      let html:string;
      try {html=await this.readHtml(host,month,signal);}
      catch(error) {
        const transient=error instanceof TypeError || error instanceof SourceFailure && [500,502,503,504].includes(error.httpStatus || 0);
        if(!transient || signal.aborted) throw error;
        await new Promise(resolve=>setTimeout(resolve,500));signal.throwIfAborted();
        html=await this.readHtml(host,month,signal);
      }
      return parsePublicMonth(html,host,month,new Date().toISOString());
    } catch(error) {
      return {...failure(error instanceof SourceFailure?error.status:error instanceof Error && /timeout|abort/i.test(error.name)?'TIMEOUT':error instanceof TypeError?'NETWORK_OR_CORS':'PARSER_UNSUPPORTED',`선상24 공개 예약표 조회 미완료: ${error instanceof Error?error.message:'원본 확인 실패'}`),httpStatus:error instanceof SourceFailure?error.httpStatus:undefined};
    }
  }
}
