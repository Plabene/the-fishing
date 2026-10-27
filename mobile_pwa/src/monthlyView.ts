import { el, STATUS_LABELS, sourceLink } from './dayView';
import { LABELS, type AppState } from './models';
import { tierFor } from './tierStore';
import { eventStatus } from './availabilityStore';
import { queryMonth } from './monthlyQuery';
import { speciesBadge, tripDescription } from './species';
import {regionLabel} from './regions';
import {platformBadge} from './platforms';
import {retainFocus} from './uiFocus';

export function renderMonthlyList(target:HTMLElement,state:AppState,result:ReturnType<typeof queryMonth>,limit:number,onMore:()=>void,onDay:(date:string,keyboard?:boolean)=>void) {
  const restoreFocus=retainFocus(target,()=>target.querySelector('.month-date-heading') || document.querySelector('#booking-heading'));
  target.replaceChildren();
  if (!result.events.length) {
    target.append(el('p',`${result.failures.length?'조회에 실패한 선박이 있습니다. 다시 조회하거나 공식 페이지를 확인하세요.':result.missingBoats.length?'아직 확인하지 못한 선박이 있습니다. 조회하기로 새 잔여석을 확인하세요.':'선택 조건에 맞는 월별 일정이 없습니다. 어종·인원 조건을 확인하세요.'} 자료가 없다고 예약 마감인 것은 아닙니다.`,'empty'));
    restoreFocus();return;
  }
  let date='';
  for (const event of result.events.slice(0,limit)) {
    if (date!==event.date) {
      date=event.date;
      const heading=el('button',`${date} · ${result.events.filter(e=>e.date===date).length}개 일정`,'month-date-heading');
      heading.dataset.focusKey=`month-date:${date}`;
      const day=date; heading.addEventListener('click',event=>onDay(day,event.detail===0)); target.append(heading);
    }
    const boat=state.boats.find(b=>b.uid===event.uid), row=el('article','','monthly-result');
    const info=el('div'), status=eventStatus(event,state);
    if(boat) info.append(platformBadge(boat));
    info.append(el('span',LABELS[tierFor(state,event.uid)],'result-tier'),el('h3',boat?.name || event.uid),speciesBadge(event),tripDescription(event),el('p',`${boat ? regionLabel(boat)+' · ':''}${event.port || boat?.port || '항구 미표시'} · ${event.departure || '시간 미표시'}`,'muted'));
    const detail=el('div','','result-detail');
    detail.append(el('strong',event.remaining===null ? '잔여석 미확인' : `조회 당시 ${event.remaining}석`),el('span',STATUS_LABELS[status],`badge status-${status.toLowerCase()}`));
    if (event.price!==undefined && event.price!==null) detail.append(el('span',`${event.price.toLocaleString('ko-KR')}원`,'muted'));
    const footer=el('div','','monthly-footer');
    footer.append(el('span',event.observedAt ? new Date(event.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '조회 시각 미확인','timestamp'));
    if(event.reservationStatusLabel) detail.append(el('span',`원본 예약 상태 · ${event.reservationStatusLabel}`,'muted'));
    const link=boat && sourceLink(event.reservationUrl || boat.url,boat.uid,`${boat.name} · ${event.date} · ${event.departure || '시간 미표시'} · ${event.trip}`); if (link) {link.dataset.focusKey=`month-source:${event.uid}:${event.id}`;footer.append(link);}
    row.append(info,detail,footer); target.append(row);
  }
  if (result.events.length>limit) {
    const more=el('button',`50개 더 보기 · ${limit} / ${result.events.length}개 표시`,'more-results');
    more.dataset.focusKey='month-more';
    more.addEventListener('click',onMore); target.append(more);
  }
  restoreFocus();
}
