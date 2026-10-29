import { apiOrigin } from './thefishingApi';
import { TIDE_STATION,tideDates,validateTideDay,type TideDay } from '../tides';
import {TIDE_STATIONS,type TideStationCode} from '../tideStations';
export async function readTideMonth(origin:string,month:string,signal:AbortSignal,request:typeof fetch=fetch,station:TideStationCode=TIDE_STATION):Promise<{days:TideDay[];message:string;partial:boolean}> {
  const dates=new Set(tideDates(month));
  const response=await request(`${apiOrigin(origin)}/v1/tides?month=${month}&station=${station}`,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
  if(!response.ok) throw new Error('물때 조회 서버에 연결하지 못했습니다.');
  const body=await response.text();if(body.length>150000) throw new Error('물때 응답 크기를 확인하세요.');
  const data=JSON.parse(body);
  if(data.schema!==1 || data.stationCode!==station || data.month!==month || !['OK','PARTIAL'].includes(data.status) || !Array.isArray(data.days) || data.days.length>dates.size) throw new Error(`이 월의 ${TIDE_STATIONS[station].name} 공식 물때를 확인하지 못했습니다. 저장 자료는 유지합니다.`);
  const days=data.days.map(validateTideDay),seen=new Set<string>();
  for(const day of days) {if(day.stationCode!==station || !dates.has(day.date) || seen.has(day.date)) throw new Error('물때 날짜·관측소가 요청과 다릅니다.');seen.add(day.date);}
  if(!days.some((day:TideDay)=>day.date.startsWith(month+'-')) || (data.status==='OK' && seen.size!==dates.size)) throw new Error('이 월의 물때 자료가 부족합니다.');
  return {days,partial:data.status==='PARTIAL',message:data.status==='PARTIAL' ? '일부 물때 자료만 갱신했습니다. 나머지는 같은 관측소의 저장 자료를 유지합니다.':`${TIDE_STATIONS[station].name} 물때 ${data.cached?'12시간 이내 저장 응답 확인':'갱신 완료'}`};
}
