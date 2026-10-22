import { dateOnly, timestamp } from './models';

export const TIDE_STATION='DT_0025';
export const TIDE_SOURCE_URL='https://www.data.go.kr/data/15156018/openapi.do';
export const TIDE_TTL=12*60*60*1000;
export type TideQuality='boundary_complete'|'month_transitions'|'daily_range_fallback'|'insufficient';
export type TideGrade='gold'|'silver'|'normal'|'insufficient';
export interface TideExtremum {timestamp:string;levelCm:number;kind:'high'|'low'}
export interface TideDay {date:string;stationCode:typeof TIDE_STATION;extrema:TideExtremum[];fetchedAt:string}
export interface CalculatedTide extends TideDay {highestCm:number;lowestCm:number;rangeCm:number;representativeCm:number|null;flowPercent:number|null;grade:TideGrade;quality:TideQuality}
export const qualityLabels:Record<TideQuality,string>={boundary_complete:'경계일 포함',month_transitions:'본월 데이터 근사',daily_range_fallback:'당일 고저차 근사',insufficient:'기준 데이터 부족'};
export function tideDates(month:string):string[] {
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) throw new Error('물때 조회 월을 확인하세요.');
  const [year,m]=month.split('-').map(Number),last=new Date(Date.UTC(year,m,0)).getUTCDate();
  return Array.from({length:last+2},(_,i)=>new Date(Date.UTC(year,m-1,i)).toISOString().slice(0,10));
}
function kst(value:string):string {return new Date(Date.parse(value)+9*3600000).toISOString().slice(0,19)+'+09:00';}
export function validateTideDay(value:unknown):TideDay {
  if(!value || typeof value!=='object') throw new Error('물때 자료 형식 오류');
  const row=value as Record<string,unknown>,date=dateOnly(row.date),fetchedAt=timestamp(row.fetchedAt);
  if(!date || !fetchedAt || row.stationCode!==TIDE_STATION || !Array.isArray(row.extrema) || row.extrema.length>12) throw new Error('물때 날짜·관측소·자료 시각 오류');
  const unique=new Map<string,TideExtremum>();
  for(const item of row.extrema) {
    if(!item || typeof item!=='object') throw new Error('고저조 항목 오류');
    const e=item as Record<string,unknown>;
    if(typeof e.timestamp!=='string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(e.timestamp) || !Number.isFinite(Date.parse(e.timestamp)) || typeof e.levelCm!=='number' || !Number.isFinite(e.levelCm) || e.levelCm < -1000 || e.levelCm>3000 || !['high','low'].includes(String(e.kind))) throw new Error('고저조 시각·조위 오류');
    const at=kst(e.timestamp);if(at.slice(0,10)!==date) throw new Error('물때 날짜 불일치');
    const extremum={timestamp:at,levelCm:e.levelCm,kind:e.kind as 'high'|'low'};unique.set(JSON.stringify(extremum),extremum);
  }
  const extrema=[...unique.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp) || a.kind.localeCompare(b.kind) || a.levelCm-b.levelCm);
  const highs=extrema.filter(e=>e.kind==='high'),lows=extrema.filter(e=>e.kind==='low');
  const range=Math.max(...highs.map(e=>e.levelCm))-Math.min(...lows.map(e=>e.levelCm));
  if(!highs.length || !lows.length || range<0 || range>3000) throw new Error('고조·저조 자료 부족');
  return {date,stationCode:TIDE_STATION,extrema,fetchedAt};
}
export function mergeTideDays(...sources:unknown[]):TideDay[] {
  const days=new Map<string,TideDay>();
  for(const source of sources) if(Array.isArray(source)) for(const row of source.slice(0,1000)) {
    try {const day=validateTideDay(row),old=days.get(day.date);if(!old || Date.parse(day.fetchedAt)>=Date.parse(old.fetchedAt)) days.set(day.date,day);} catch { /* Keep other validated dates. */ }
  }
  return [...days.values()].sort((a,b)=>b.fetchedAt.localeCompare(a.fetchedAt)).slice(0,1000).sort((a,b)=>a.date.localeCompare(b.date));
}
export function tideGrade(percent:number|null):TideGrade {return percent===null ? 'insufficient':percent<30 ? 'gold':percent<=60 ? 'silver':'normal';}
export function tideTransitions(extrema:TideExtremum[]) {
  const unique=[...new Map(extrema.map(e=>[JSON.stringify(e),e])).values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp) || a.kind.localeCompare(b.kind) || a.levelCm-b.levelCm);
  return unique.slice(1).flatMap((end,i)=>{
    const start=unique[i],hours=(Date.parse(end.timestamp)-Date.parse(start.timestamp))/3600000,difference=Math.abs(end.levelCm-start.levelCm);
    return start.kind!==end.kind && hours>0 && hours<=18 && difference<=3000 ? [{start,end,difference}]:[];
  });
}
/** Port of boryeong_tide.normalize_monthly_tide_ranges (PC flow schema 4). */
export function calculateTideMonth(month:string,input:TideDay[]) {
  const dates=tideDates(month),byDate=new Map(input.map(d=>[d.date,d])),valid=dates.slice(1,-1).flatMap(date=>byDate.get(date) ? [byDate.get(date)!]:[]);
  const missingBoundaryDates=[dates[0],dates.at(-1)!].filter(date=>!byDate.get(date)?.extrema.length);
  const monthTransitions=tideTransitions(valid.flatMap(d=>d.extrema));
  const boundaryTransitions=missingBoundaryDates.length ? []:tideTransitions(dates.flatMap(date=>byDate.get(date)?.extrema || []));
  const touching=(transitions:ReturnType<typeof tideTransitions>,date:string)=>{
    const values=transitions.filter(t=>t.start.timestamp.slice(0,10)===date || t.end.timestamp.slice(0,10)===date).map(t=>t.difference);
    return values.length ? Math.max(...values):null;
  };
  const days:Record<string,CalculatedTide>={};
  for(const day of valid) {
    const highestCm=Math.max(...day.extrema.filter(e=>e.kind==='high').map(e=>e.levelCm)),lowestCm=Math.min(...day.extrema.filter(e=>e.kind==='low').map(e=>e.levelCm)),rangeCm=highestCm-lowestCm;
    let representativeCm=touching(boundaryTransitions,day.date),quality:TideQuality='boundary_complete';
    if(representativeCm===null) {representativeCm=touching(monthTransitions,day.date);quality='month_transitions';}
    if(representativeCm===null) {representativeCm=touching(tideTransitions(day.extrema),day.date) ?? rangeCm;quality='daily_range_fallback';}
    days[day.date]={...day,highestCm,lowestCm,rangeCm,representativeCm,quality,flowPercent:null,grade:'insufficient'};
  }
  const representatives=Object.values(days).flatMap(d=>d.representativeCm===null ? []:[d.representativeCm]);
  const referenceMinCm=representatives.length ? Math.min(...representatives):null,referenceMaxCm=representatives.length ? Math.max(...representatives):null;
  if(referenceMinCm!==null && referenceMaxCm!==null && referenceMaxCm>referenceMinCm) for(const day of Object.values(days)) {
    if(day.representativeCm===null) continue;
    day.flowPercent=Math.trunc(Math.min(100,Math.max(0,(day.representativeCm-referenceMinCm)/(referenceMaxCm-referenceMinCm)*100)));
    day.grade=tideGrade(day.flowPercent);
  }
  return {month,stationCode:TIDE_STATION,days,expectedDays:dates.length-2,complete:valid.length===dates.length-2,missingBoundaryDates,referenceMinCm,referenceMaxCm};
}
export type TideMonth=ReturnType<typeof calculateTideMonth>;
