import {parseHTML} from 'linkedom';
import {dateOnly,text,type Observation} from '../src/models';
import {eventSpecies,speciesLabel} from '../src/species';
import {SUNSANG_PUBLIC_ROUTES,publicRouteForShip,SUNSANG_PUBLIC_UNMAPPED} from '../src/sunsang24PublicRoutes';
import type {ProviderResult} from '../src/provider';
import {apiFailure,validQuery,type Store} from './service';
import {scheduleStatus} from './sunsang24';

const AGENT='TheFishingAvailability';
const UA=`${AGENT}/1.0 (+https://github.com/Plabene/the-fishing)`;
type PublicResult=ProviderResult & {host?:string;month?:string;shipIds?:string[]};
class SourceFailure extends Error {constructor(message:string,readonly status:ProviderResult['status']) {super(message);}}
const failure=(status:ProviderResult['status'],message:string):PublicResult=>({...apiFailure(status,message),stop:false});

/** RFC-style longest matching rule, with specific agent groups taking precedence. */
export function robotsAllows(body:string,path:string):boolean {
  const groups:Array<{agents:string[];rules:Array<{allow:boolean;path:string}>}>=[];
  let group:typeof groups[number]|undefined,hasRules=false;
  for(const raw of body.split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(),colon=line.indexOf(':');if(colon<0) continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(key==='user-agent') {
      if(!group || hasRules) {group={agents:[],rules:[]};groups.push(group);hasRules=false;}
      group.agents.push(value.toLowerCase());
    } else if(group) {hasRules=true;if((key==='allow' || key==='disallow') && value) group.rules.push({allow:key==='allow',path:value});}
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*' && AGENT.toLowerCase().includes(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  let length=-1,allow=true;
  for(const rule of selected.flatMap(g=>g.rules)) {
    const pattern=rule.path.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$');
    if(new RegExp('^'+pattern).test(path) && (rule.path.length>length || (rule.path.length===length && rule.allow))) {length=rule.path.length;allow=rule.allow;}
  }
  return allow;
}

/** Port the PC's ship_unit/date/fish/remaining selectors; never read reservation names or memos. */
export function parsePublicMonth(html:string,host:string,month:string,observedAt:string):PublicResult {
  const route=SUNSANG_PUBLIC_ROUTES.get(host);if(!route || !validQuery('1',month)) throw new Error('확인되지 않은 공개 예약표');
  const {document}=parseHTML(html),nav=document.querySelector('.month_nav')?.textContent || '';
  const ym=/(20\d\d)년\s*(\d{1,2})월/.exec(nav);
  if(!ym || `${ym[1]}-${ym[2].padStart(2,'0')}`!==month) throw new Error('원본 예약표의 조회 월이 다릅니다.');
  const events:Observation[]=[],shipIds=new Set<string>(),seen=new Set<string>();
  for(const table of document.querySelectorAll('table.ship_unit')) {
    const ship=/(?:^|\s)ship_unit_ship_no_(\d+)(?:\s|$)/.exec(table.className)?.[1];
    if(!ship || !route.ships.includes(ship)) continue;
    const details=table.querySelectorAll('.reservation_detail[data-sdate][data-schedule_no]');
    if(details.length!==1 || !text(table.querySelector('.ship_info .title')?.textContent)) throw new Error('선박 일정 구조가 변경되었습니다.');
    const detail=details[0],date=dateOnly(detail.getAttribute('data-sdate')),schedule=detail.getAttribute('data-schedule_no') || '';
    if(!date?.startsWith(month+'-') || !/^\d{1,20}$/.test(schedule) || seen.has(schedule)) throw new Error('출항일 또는 일정 식별자가 일치하지 않습니다.');
    for(const button of table.querySelectorAll('button[data-schedule_no]')) if(button.getAttribute('data-schedule_no')!==schedule) throw new Error('예약 버튼의 일정이 다릅니다.');
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
    seen.add(schedule);shipIds.add(ship);
  }
  if(!shipIds.size || events.length>2000) throw new Error('해당 월의 선박 일정을 확인하지 못했습니다. 공식 페이지에서 확인하세요.');
  return {status:'ALLOWED_READABLE',message:`공개 예약표 ${events.length}개 일정 확인`,events,host,month,shipIds:[...shipIds],observedAt,source:'api',fresh:true,cached:false};
}

/** No persistent seat cache. Only in-flight responses and access policy metadata are shared. */
export class Sunsang24PublicService {
  private pending=new Map<string,Promise<PublicResult>>();
  private budgetTail:Promise<unknown>=Promise.resolve();
  constructor(private store:Store,private request:typeof fetch=(...args)=>fetch(...args)) {}
  query(ship:string,month:string):Promise<PublicResult> {
    const route=publicRouteForShip(ship);
    if(!route) return Promise.resolve(failure('UNSUPPORTED_SOURCE',SUNSANG_PUBLIC_UNMAPPED));
    if(!validQuery('1',month)) return Promise.resolve(failure('PARSER_UNSUPPORTED','조회 월을 확인하세요.'));
    const key=`${route.host}:${month}`,existing=this.pending.get(key);if(existing) return existing;
    if(this.pending.size>=3) return Promise.resolve(failure('API_BUSY','선상24 조회 서버가 혼잡합니다. 잠시 후 다시 조회하세요.'));
    const pending=this.read(route.host,month).finally(()=>this.pending.delete(key));this.pending.set(key,pending);return pending;
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
      throw new SourceFailure(`원본 접근 제한 HTTP ${response.status}. 해당 선사의 조회를 잠시 중지합니다.`,'ACCESS_RESTRICTED');
    }
    return response;
  }
  private async body(response:Response,max:number):Promise<string> {
    const reader=response.body?.getReader();if(!reader) throw new Error('원본 응답 없음');
    const decoder=new TextDecoder();let count=0,result='';
    try {for(;;) {const part=await reader.read();if(part.done) break;count+=part.value.length;if(count>max) throw new Error('원본 응답 크기 초과');result+=decoder.decode(part.value,{stream:true});}return result+decoder.decode();}
    finally {await reader.cancel();}
  }
  private async read(host:string,month:string):Promise<PublicResult> {
    try {
      if((await this.store.get<number>(`blocked:${host}`) || 0)>Date.now()) return failure('ACCESS_RESTRICTED','해당 선사의 원본 접근 제한이 해제될 때까지 조회를 중지합니다.');
      const signal=AbortSignal.timeout(25000),path='/ship/schedule_fleet/'+month.replace('-','');
      let policy=await this.store.get<{at:number;body:string}>(`robots:${host}`);
      if(!policy || Date.now()-policy.at>=3600000) {
        const response=await this.get(host,'/robots.txt',signal);
        if(![200,404].includes(response.status)) throw new SourceFailure('공개 페이지의 접근 정책을 확인하지 못했습니다.','HTTP_ERROR');
        policy={at:Date.now(),body:response.status===404?'':await this.body(response,100000)};
        await this.store.put(`robots:${host}`,policy);
      }
      if(!robotsAllows(policy.body,path)) return failure('PERMISSION_DENIED','해당 선사 홈페이지의 접근 정책에 따라 자동 조회를 중지했습니다. 공식 페이지에서 확인하세요.');
      const response=await this.get(host,path,signal);
      if(response.status!==200) throw new SourceFailure(`공개 예약표 HTTP ${response.status}`,'HTTP_ERROR');
      if(!response.headers.get('content-type')?.includes('text/html')) throw new Error('공개 예약표 HTML이 아닙니다.');
      const html=await this.body(response,4000000);
      return parsePublicMonth(html,host,month,new Date().toISOString());
    } catch(error) {
      return failure(error instanceof SourceFailure?error.status:error instanceof Error && /timeout|aborted/i.test(error.name)?'TIMEOUT':error instanceof TypeError?'NETWORK_OR_CORS':'PARSER_UNSUPPORTED',`선상24 공개 예약표 조회 미완료: ${error instanceof Error?error.message:'원본 확인 실패'}`);
    }
  }
}
