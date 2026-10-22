import { el, STATUS_LABELS, sourceLink } from './dayView';
import { LABELS, type AppState } from './models';
import { tierFor } from './tierStore';
import { eventStatus } from './availabilityStore';
import { queryMonth } from './monthlyQuery';
import { speciesBadge } from './species';
import {regionLabel} from './regions';
import {platformBadge} from './platforms';

export function renderMonthlyList(target:HTMLElement,state:AppState,result:ReturnType<typeof queryMonth>,limit:number,onMore:()=>void,onDay:(date:string)=>void) {
  target.replaceChildren();
  if (!result.events.length) {
    target.append(el('p','조건에 맞는 월별 조회 결과가 없습니다. 다른 월·인원을 선택하거나 PC 조회 결과를 가져오세요. 자료가 없다고 예약 마감인 것은 아닙니다.','empty'));
    return;
  }
  let date='';
  for (const event of result.events.slice(0,limit)) {
    if (date!==event.date) {
      date=event.date;
      const heading=el('button',`${date} · ${result.events.filter(e=>e.date===date).length}개 일정`,'month-date-heading');
      const day=date; heading.addEventListener('click',()=>onDay(day)); target.append(heading);
    }
    const boat=state.boats.find(b=>b.uid===event.uid), row=el('article','','monthly-result');
    const info=el('div'), status=eventStatus(event,state);
    if(boat) info.append(platformBadge(boat));
    info.append(el('span',LABELS[tierFor(state,event.uid)],'result-tier'),el('h3',boat?.name || event.uid),speciesBadge(event),el('p',event.trip || '출조명 미표시'),el('p',`${boat ? regionLabel(boat)+' · ':''}${event.port || boat?.port || '항구 미표시'} · ${event.departure || '시간 미표시'}`,'muted'));
    const detail=el('div','','result-detail');
    detail.append(el('strong',event.remaining===null ? '잔여석 미확인' : `조회 당시 ${event.remaining}석`),el('span',STATUS_LABELS[status],`badge status-${status.toLowerCase()}`));
    if (event.price!==undefined && event.price!==null) detail.append(el('span',`${event.price.toLocaleString('ko-KR')}원`,'muted'));
    detail.append(el('span',event.observedAt ? new Date(event.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '조회 시각 미확인','timestamp'));
    if(event.reservationStatusLabel) detail.append(el('span',`원본 예약 상태 · ${event.reservationStatusLabel}`,'muted'));
    const link=boat && sourceLink(event.reservationUrl || boat.url,boat.uid); if (link) detail.append(link);
    row.append(info,detail); target.append(row);
  }
  if (result.events.length>limit) {
    const more=el('button',`50개 더 보기 · ${limit} / ${result.events.length}개 표시`,'more-results');
    more.addEventListener('click',onMore); target.append(more);
  }
}
