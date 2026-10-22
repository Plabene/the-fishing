import catalog from '../src/data/sunsang24Fleet.json';
import {dateOnly,text,type Observation} from '../src/models';
import {SUNSANG24_DISABLED_MESSAGE} from '../src/platforms';
import {eventSpecies,speciesLabel} from '../src/species';
import type {ProviderResult} from '../src/provider';
import {apiFailure,validQuery,type Store} from './service';

type Area={id:string;provinceId:string;province:string;local:string};
export const SUNSANG_AREAS=new Map<string,Area>();
for(const b of catalog.boats) if(b.areaId) SUNSANG_AREAS.set(b.areaId,{id:b.areaId,provinceId:b.provinceId,province:b.province,local:b.local});
type Obj=Record<string,unknown>;
class SourceFailure extends Error {constructor(message:string,readonly status:ProviderResult['status']) {super(message);}}
const object=(value:unknown):Obj=>value && typeof value==='object' && !Array.isArray(value) ? value as Obj:{};
const number=(value:unknown,max:number):number|null=> {
  if(typeof value!=='number' && typeof value!=='string') return null;
  const s=String(value).replaceAll(',','').trim();if(!/^\d+$/.test(s)) return null;
  const n=Number(s);return Number.isSafeInteger(n) && n<=max ? n:null;
};
const statuses:Record<string,string>={ING:'available',OPEN:'available',AVAILABLE:'available',WAIT:'waitlist',WAITING:'waitlist',WAITLIST:'waitlist',END:'closed',CLOSED:'closed',UNAVAILABLE:'closed',CHECK:'maintenance',MAINTENANCE:'maintenance',CANCEL:'cancelled',CANCELLED:'cancelled',BAD_WEATHER:'weather',BADWEATHER:'weather',WEATHER:'weather',INACTIVE:'inactive'};
export function scheduleStatus(code:unknown,label:unknown):string {
  const known=statuses[text(code).toUpperCase()];if(known) return known;
  const value=text(label).replaceAll(' ','');
  for(const [pattern,status] of [[/예약가능|잔여/,'available'],[/대기/,'waitlist'],[/점검|정비/,'maintenance'],[/기상|악천후/,'weather'],[/취소/,'cancelled'],[/마감|예약불가/,'closed'],[/비활성|운영중단/,'inactive']] as const) if(pattern.test(value)) return status;
  return 'unknown';
}
/** Port of the PC central parser. Unlike its old zero fallback, missing seats stay null. */
export async function parseSchedule(value:unknown,area:Area,month:string,observedAt:string):Promise<Observation> {
  const row=object(value),ship=object(row.ship),shipId=text(ship.no || ship.ship_no || row.ship_no),date=dateOnly(row.sdate);
  if(!/^\d{1,10}$/.test(shipId) || !text(ship.name || row.ship_name) || !date?.startsWith(month+'-')) throw new Error('선박 식별자·출항일 불일치');
  if(text(ship.area_main || row.region_group)!==area.province || text(ship.area_sub || row.local_area)!==area.local) throw new Error('요청한 하위 지역과 응답 지역 불일치');
  const schedule=text(row.schedule_no || row.card_id || row.id),trip=text(row.fish_type || row.fishing_method || '출조 정보 미표시');
  const speciesKey=eventSpecies({trip,species:text(row.fish_type)}),departure=/^(?:[01]\d|2[0-3]):[0-5]\d/.exec(text(row.stime))?.[0] || '';
  const reservationStatus=scheduleStatus(row.schedule_status_code || row.status_code,row.schedule_status_name || row.status);
  const rawPrice=number(row.price,100000000),free=['free','무료'].includes(text(row.view_money_type).toLowerCase()) || [true,'Y','true',1,'1'].includes(row.is_free as never);
  const price=rawPrice===0 && !free ? null:rawPrice;
  let id=`sunsang24-schedule-${schedule}`;
  if(schedule && !/^\d{1,20}$/.test(schedule)) throw new Error('일정 식별자 형식 변경');
  if(!schedule) {
    const input=JSON.stringify([shipId,date,departure,text(row.fish_type).normalize('NFKC').toLowerCase(),rawPrice]);
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
    id='sunsang24-derived-'+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
  }
  const port=text(ship.port_name || ship.departure_port || ship.port || ship.area);
  return {id,uid:`sunsang24:ship:${shipId}`,date,trip,departure,port:port.endsWith('인근') ? '':port,
    speciesKey,species:speciesLabel(speciesKey),price,
    remaining:number(row.remain_embarkation_num,10000),verified:reservationStatus!=='unknown',observedAt,source:'api',
    reservationStatus,reservationStatusLabel:text(row.schedule_status_name || row.status || row.schedule_status_code,80),
    reservationUrl:`https://www.sunsang24.com/ship/list?ship_no=${shipId}&sdate=${date}`};
}
export interface SunsangResult extends ProviderResult {area?:string;month?:string}
/** Separate coordinator and budget; no successful schedule is stored or reused across queries. */
export class Sunsang24Service {
  private pending=new Map<string,Promise<SunsangResult>>();
  private tail:Promise<unknown>=Promise.resolve();
  private nextRequest=0;
  constructor(private store:Store,private enabled=false,private request:typeof fetch=fetch,private gapMs=1000) {}
  query(areaId:string,month:string):Promise<SunsangResult> {
    if(!SUNSANG_AREAS.has(areaId) || !validQuery('1',month)) return Promise.resolve(apiFailure('PARSER_UNSUPPORTED','확인된 지역 코드와 조회 월이 필요합니다.'));
    if(!this.enabled) return Promise.resolve({...apiFailure('PERMISSION_DENIED',SUNSANG24_DISABLED_MESSAGE),stop:false});
    const key=`${areaId}:${month}`,existing=this.pending.get(key);if(existing) return existing;
    if(this.pending.size>=3) return Promise.resolve(apiFailure('API_BUSY','선상24 조회가 혼잡합니다. 잠시 후 다시 조회하세요.'));
    const result=this.tail.then(()=>this.read(SUNSANG_AREAS.get(areaId)!,month)).finally(()=>this.pending.delete(key));
    this.tail=result.catch(()=>{});this.pending.set(key,result);return result;
  }
  private async get(url:string,signal:AbortSignal):Promise<Obj> {
    signal.throwIfAborted();
    const budget=await this.store.get<{window:number;count:number}>('budget') || {window:Date.now(),count:0};
    if(Date.now()-budget.window>=60000) {budget.window=Date.now();budget.count=0;}
    if(budget.count>=30) throw new Error('요청 예산 초과');
    const wait=Math.max(0,this.nextRequest-Date.now());if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
    signal.throwIfAborted();budget.count++;await this.store.put('budget',budget);this.nextRequest=Date.now()+this.gapMs;
    let response:Response;
    try {response=await this.request(url,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',headers:{Accept:'application/json'},signal});}
    catch(error) {if(signal.aborted || (error instanceof Error && error.name==='TimeoutError')) throw new SourceFailure('원본 요청 시간 초과','TIMEOUT');throw new SourceFailure('원본 연결 실패','NETWORK_OR_CORS');}
    if([401,403,429].includes(response.status)) {
      const retry=Number(response.headers.get('retry-after'));
      await this.store.put('blockedUntil',Date.now()+Math.max(600000,Number.isFinite(retry)?Math.min(retry,86400)*1000:0));
      throw new Error(`접근 제한 HTTP ${response.status}`);
    }
    if(response.status!==200) throw new SourceFailure(`원본 HTTP ${response.status}`,'HTTP_ERROR');
    if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('원본 JSON 응답이 아닙니다.');
    const body=await response.text();if(body.length>2000000) throw new Error('응답 크기 초과');
    return object(JSON.parse(body));
  }
  private async read(area:Area,month:string):Promise<SunsangResult> {
    try {
      if((await this.store.get<number>('blockedUntil') || 0)>Date.now()) return apiFailure('ACCESS_RESTRICTED','선상24 접근 제한으로 조회를 잠시 중지했습니다.');
      const signal=AbortSignal.timeout(25000),observedAt=new Date().toISOString();
      let hierarchy=await this.store.get<{at:number;data:Obj}>('areas');
      if(!hierarchy || Date.now()-hierarchy.at>3600000) {
        hierarchy={at:Date.now(),data:await this.get('https://api.sunsang24.com/ship/filter_area/general',signal)};
        if(!Array.isArray(hierarchy.data.area)) throw new Error('지역 계층 형식 변경');
        await this.store.put('areas',hierarchy);
      }
      const groups=hierarchy.data.area as unknown[],group=groups.map(object).find(g=>String(g.no)===area.provinceId && g.title===area.province);
      if(!group || !Array.isArray(group.items) || !group.items.map(object).some(c=>String(c.no)===area.id && c.name===area.local)) throw new Error('저장된 지역 코드가 현재 계층과 다릅니다.');
      const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),events=new Map<string,Observation>();
      let total:number|null=null;
      for(let page=1;page<=20;page++) {
        const params=new URLSearchParams({area:area.id,area_text:area.local,area_type:'area',fish:'',fishing_method_travelout:'',is_coupon:'',is_possible:'',keyword:'',page:String(page),pay:'',sdate:`${month}-01,${month}-${last}`,search:'',type:'general',use_time:'',walkthrough:''});
        const data=await this.get('https://api.sunsang24.com/ship/list?'+params,signal),pageTotal=number(data.total,600);
        if(pageTotal===null || !Array.isArray(data.list) || data.list.length>30) throw new Error('응답 건수 또는 페이지 한도 변경');
        if(total===null) total=pageTotal;else if(pageTotal!==total) throw new Error('조회 도중 전체 건수가 변경됨');
        for(const row of data.list) {
          const event=await parseSchedule(row,area,month,observedAt);
          if(events.has(event.id)) throw new Error('페이지에서 일정 중복 또는 변경 발생');
          events.set(event.id,event);
        }
        if(events.size>total) throw new Error('전체 건수와 수집 건수 불일치');
        if(events.size===total) return {status:'ALLOWED_READABLE',message:`선상24 ${events.size}개 일정 확인`,events:[...events.values()],area:area.id,month,observedAt,source:'api',fresh:true,cached:false};
        if(!data.list.length) throw new Error('전체 건수 도달 전 빈 페이지');
      }
      throw new Error('완전한 결과를 제한 시간·페이지 안에 확인하지 못함');
    } catch(error) {
      const message=error instanceof Error ? error.message:'응답 확인 실패';
      return apiFailure(error instanceof SourceFailure ? error.status:/접근 제한/.test(message)?'ACCESS_RESTRICTED':/timeout|aborted/i.test(message)?'TIMEOUT':'PARSER_UNSUPPORTED',`선상24 조회 미완료: ${message}`);
    }
  }
}
