import { TIDE_STATION,TIDE_TTL,tideDates,validateTideDay,type TideDay } from '../src/tides';
import type { Store } from './service';

const ENDPOINT='https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService';
export interface TideResult {schema:1;stationCode:typeof TIDE_STATION;month:string;status:'OK'|'PARTIAL'|'UNAVAILABLE';days:TideDay[];missingDates:string[];message:string;cached?:boolean}
export const tideUnavailable=(month:string,message:string):TideResult=>({schema:1,stationCode:TIDE_STATION,month,status:'UNAVAILABLE',days:[],missingDates:[],message});
class TideError extends Error {constructor(message:string,readonly fatal=false) {super(message);}}
export function parseTideResponse(payload:unknown,date:string,fetchedAt:string):TideDay {
  const data=payload as any,root=data?.response || data,code=String(root?.header?.resultCode ?? '');
  if(!['0','00'].includes(code)) {
    if(['20','22','23','29','30','31','32'].includes(code)) throw new TideError('공공데이터 API 인증·호출 제한으로 물때를 조회하지 못했습니다.',true);
    throw new TideError('해당 날짜의 공식 조석예보를 확인하지 못했습니다.');
  }
  const body=root.body,container=body?.items,raw=Array.isArray(container) ? container:container?.item;
  const items=Array.isArray(raw) ? raw:raw && typeof raw==='object' ? [raw]:[];
  const total=Number(body?.totalCount ?? container?.totalCount);
  if(!items.length || items.length>12 || !Number.isInteger(total) || total!==items.length) throw new TideError('조석예보 자료가 없거나 응답이 완전하지 않습니다.');
  const extrema=items.map((item:any)=>{
    const time=String(item.predcDt || '').replace(' ','T');
    if(!new RegExp(`^${date}T\\d{2}:\\d{2}(?::\\d{2})?$`).test(time) || item.obsvtrNm!=='보령' || (item.obsCode && item.obsCode!==TIDE_STATION)) throw new TideError('물때 날짜 또는 관측소가 일치하지 않습니다.');
    const code=Number(item.extrSe),level=Number(item.predcTdlvVl);
    if(![1,2,3,4].includes(code) || item.predcTdlvVl==null || item.predcTdlvVl==='') throw new TideError('조석예보 항목 형식 오류');
    return {timestamp:time+'+09:00',levelCm:level,kind:[1,3].includes(code) ? 'high':'low'};
  });
  return validateTideDay({date,stationCode:TIDE_STATION,fetchedAt,extrema});
}

/** A dedicated named Durable Object keeps tides separate from vessel request budgets. */
export class TideService {
  private pending=new Map<string,Promise<TideResult>>();
  private tail:Promise<unknown>=Promise.resolve();
  private pace:Promise<unknown>=Promise.resolve();
  private lastStart=0;
  // Workers' native fetch rejects a TideService receiver; keep its global call context.
  constructor(private store:Store,private key='',private request:typeof fetch=(input,init)=>fetch(input,init),private now=()=>Date.now(),private gap=300) {}
  query(month:string):Promise<TideResult> {
    try {tideDates(month);} catch {return Promise.resolve(tideUnavailable(month,'물때 조회 월을 확인하세요.'));}
    const existing=this.pending.get(month);if(existing) return existing;
    if(this.pending.size>=3) return Promise.resolve(tideUnavailable(month,'물때 조회가 진행 중입니다. 잠시 후 다시 시도하세요.'));
    const work=this.tail.then(()=>this.run(month)).catch(()=>tideUnavailable(month,'물때 조회 처리에 실패했습니다. 저장 자료는 유지합니다.')).finally(()=>this.pending.delete(month));
    this.pending.set(month,work);this.tail=work;return work;
  }
  private async read(date:string):Promise<TideDay> {
    const start=this.pace.then(async()=>{const delay=this.lastStart+this.gap-this.now();if(delay>0) await new Promise(r=>setTimeout(r,delay));this.lastStart=this.now();});
    this.pace=start.catch(()=>{});await start;
    let serviceKey=this.key.trim();try {if(/%[a-f0-9]{2}/i.test(serviceKey)) serviceKey=decodeURIComponent(serviceKey);} catch {throw new TideError('공공데이터 API 인증 설정을 확인하세요.',true);}
    const url=new URL(ENDPOINT);url.search=new URLSearchParams({serviceKey,obsCode:TIDE_STATION,reqDate:date.replaceAll('-',''),pageNo:'1',numOfRows:'300',type:'json'}).toString();
    let response:Response;
    try {response=await this.request(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});} catch {throw new TideError('공식 조석예보 서버 연결이 지연됩니다.',true);}
    // Never include the request URL, raw body or upstream error in a response/log (they may echo a key).
    if(!response.ok) throw new TideError('공식 조석예보 서버에서 요청을 처리하지 못했습니다.',true);
    const content=await response.text();if(content.length>100000) throw new TideError('조석예보 응답 크기 오류',true);
    let payload:unknown;try {payload=JSON.parse(content);} catch {throw new TideError('공식 조석예보 응답 형식을 확인하지 못했습니다.',true);}
    return parseTideResponse(payload,date,new Date(this.now()).toISOString());
  }
  private async run(month:string):Promise<TideResult> {
    const dates=tideDates(month),key=`tide-month-v1:${month}`,cached=await this.store.get<{expires:number;result:TideResult}>(key);
    if(cached && cached.expires>this.now()) return {...cached.result,cached:true};
    if(!this.key) return tideUnavailable(month,'물때 API 인증키가 서버에 설정되지 않았습니다.');
    const cooldown=await this.store.get<number>('tide-cooldown') || 0;if(cooldown>this.now()) return tideUnavailable(month,'물때 조회를 잠시 대기 중입니다. 저장 자료를 확인하세요.');
    const days:TideDay[]=[],missing:string[]=[];
    for(const date of dates) {
      const day=await this.store.get<TideDay>(`tide-day:${date}`);
      if(day && this.now()-Date.parse(day.fetchedAt)<TIDE_TTL) days.push(day);else missing.push(date);
    }
    const today=new Date(this.now()).toISOString().slice(0,10),budget=await this.store.get<{date:string;count:number}>('tide-budget');
    const used=budget?.date===today ? budget.count:0;
    if(used+missing.length>2000) return tideUnavailable(month,'물때 조회의 일일 처리량에 도달했습니다. 저장 자료를 확인하세요.');
    await this.store.put('tide-budget',{date:today,count:used+missing.length});
    let cursor=0,stopped=false,message='';
    await Promise.all(Array.from({length:Math.min(3,missing.length)},async()=>{
      while(!stopped && cursor<missing.length) {
        const date=missing[cursor++];
        try {const day=await this.read(date);await this.store.put(`tide-day:${date}`,day);days.push(day);}
        catch(error) {message=error instanceof TideError ? error.message:'조석예보 자료를 해석하지 못했습니다.';if(error instanceof TideError && error.fatal) stopped=true;}
      }
    }));
    if(stopped) await this.store.put('tide-cooldown',this.now()+60000);
    days.sort((a,b)=>a.date.localeCompare(b.date));
    const found=new Set(days.map(d=>d.date)),missingDates=dates.filter(date=>!found.has(date));
    const result:TideResult={schema:1,stationCode:TIDE_STATION,month,status:!missingDates.length ? 'OK':days.some(d=>d.date.startsWith(month)) ? 'PARTIAL':'UNAVAILABLE',days,missingDates,message:missingDates.length ? message || '일부 날짜의 물때 자료가 없습니다.':'보령 물때 자료를 확인했습니다.'};
    await this.store.put(key,{expires:this.now()+(result.status==='OK' ? TIDE_TTL:60000),result});
    const oldIndex=await this.store.get<string[]>('tide-index') || [],newKeys=[key,...days.map(d=>`tide-day:${d.date}`)],index=[...oldIndex.filter(k=>!newKeys.includes(k)),...newKeys];
    while(index.length>1100) await this.store.delete(index.shift()!);await this.store.put('tide-index',index);
    return result;
  }
}
