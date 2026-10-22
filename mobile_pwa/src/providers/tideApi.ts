import { apiOrigin } from './thefishingApi';
import { TIDE_STATION,tideDates,validateTideDay,type TideDay } from '../tides';
export async function readTideMonth(origin:string,month:string,signal:AbortSignal,request:typeof fetch=fetch):Promise<{days:TideDay[];message:string;partial:boolean}> {
  const dates=new Set(tideDates(month));
  const response=await request(`${apiOrigin(origin)}/v1/tides?month=${month}`,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
  if(!response.ok) throw new Error('물때 조회 서버에 연결하지 못했습니다.');
  const body=await response.text();if(body.length>150000) throw new Error('물때 응답 크기를 확인하세요.');
  const data=JSON.parse(body);
  if(data.schema!==1 || data.stationCode!==TIDE_STATION || data.month!==month || !['OK','PARTIAL'].includes(data.status) || !Array.isArray(data.days) || data.days.length>dates.size) throw new Error('이 월의 보령 물때를 확인하지 못했습니다. 저장 자료는 유지합니다.');
  const days=data.days.map(validateTideDay),seen=new Set<string>();
  for(const day of days) {if(!dates.has(day.date) || seen.has(day.date)) throw new Error('물때 날짜 범위가 요청과 다릅니다.');seen.add(day.date);}
  if(!days.some((day:TideDay)=>day.date.startsWith(month+'-')) || (data.status==='OK' && seen.size!==dates.size)) throw new Error('이 월의 물때 자료가 부족합니다.');
  return {days,partial:data.status==='PARTIAL',message:data.status==='PARTIAL' ? '일부 물때 자료만 갱신했습니다. 나머지는 저장 자료를 유지합니다.':data.cached ? '12시간 이내 보령 물때 저장 응답을 확인했습니다.':'보령 물때 자료를 갱신했습니다.'};
}
