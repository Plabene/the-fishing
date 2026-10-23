import { LABELS, TIERS, reservationLink, type AppState, type DisplayStatus, type Filter } from './models';
import { eventStatus } from './availabilityStore';
import { visibleEvents } from './calendarView';
import { orderedBoats, tierFor } from './tierStore';
import { speciesBadge } from './species';
import type { queryMonth } from './monthlyQuery';
import { calculateTideMonth } from './tides';
import { renderDayTide } from './tideView';
import {matchesRegion,regionLabel} from './regions';
import {matchesPlatform,platformBadge} from './platforms';
import {calendarStatus} from './calendarStatus';

export const STATUS_LABELS: Record<DisplayStatus, string> = { AVAILABLE: '확인된 잔여석', UNKNOWN: '확인 불가', STALE: '이전 자료', BLOCKED: '접근 제한', UNVERIFIED: '미검증', FULL: '확인된 인원 미달', DEMO: '예시 자료',UNAVAILABLE:'예약 가능 상태 아님' };
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
export function sourceLink(url: string, id: string): HTMLAnchorElement | null {
  const safe = reservationLink(url, id); if (!safe) return null;
  const link = el('a', '공식 페이지 ↗', 'source-link'); link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
export function renderDay(target: HTMLElement, state: AppState, day: string, tier: Filter, search: string, matchingOnly=false,result?:ReturnType<typeof queryMonth>): void {
  target.replaceChildren();
  const events = (result?.events ?? visibleEvents(state, tier, search,matchingOnly)).filter(e => e.date === day);
  target.append(el('h2', `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 · ${events.length}개 출조 일정`));
  if(result) {const status=calendarStatus(state,result,day);const summary=el('p',`${status.label}${result.missingBoats.length?` · ${result.missingBoats.length}척 미확인`:''}`,'day-status');summary.dataset.availability=status.kind;target.append(summary);}
  if (!events.length) target.append(el('p', '선택한 조건에 맞는 조회 결과가 없습니다. 미조회·자료 없음은 예약 마감을 뜻하지 않습니다.', 'empty'));
  const order = orderedBoats(state).map(b => b.uid);
  for (const t of TIERS) {
    const rows = events.filter(e => tierFor(state, e.uid) === t).sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid));
    if (!rows.length) continue;
    const group = el('section', '', 'day-group'); group.append(el('h3', `${LABELS[t]} · ${rows.length}건`));
    for (const event of rows) {
      const boat = state.boats.find(b => b.uid === event.uid); const status = eventStatus(event, state);
      const card = el('article', '', 'event-card'); card.dataset.status = status;
      if(boat) card.append(platformBadge(boat));
      card.append(el('span', STATUS_LABELS[status], `badge status-${status.toLowerCase()}`), el('h4', boat?.name || event.uid),
        speciesBadge(event), el('p', event.trip || '출조명 미표시'), el('p', `${boat ? regionLabel(boat)+' · ':''}${event.port || boat?.port || '항구 미표시'} · ${event.departure || '시간 미표시'}`, 'muted'),
        el('p', `조회 당시 잔여 ${event.remaining === null ? '미확인' : event.remaining + '석'}`, 'seats'),
        el('p', `관측 ${event.observedAt ? new Date(event.observedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '시각 미확인'}`, 'timestamp'));
      if (event.price!==undefined && event.price!==null) card.append(el('p',`${event.price.toLocaleString('ko-KR')}원 · 조회 당시 요금`,'muted'));
      if(event.reservationStatusLabel) card.append(el('p',`원본 예약 상태 · ${event.reservationStatusLabel}`,'muted'));
      const link = boat && sourceLink(event.reservationUrl || boat.url, boat.uid); if (link) card.append(link);
      group.append(card);
    }
    target.append(group);
  }
  const ids = new Set(state.boats.filter(b=>state.selectedUids.includes(b.uid) && matchesPlatform(b,state.selectedPlatform) && matchesRegion(b,state.selectedRegion)).map(b=>b.uid));
  for (const failure of state.failures.filter(f => f.month === state.month && ids.has(f.uid) && (tier === 'all' || tierFor(state, f.uid) === tier))) {
    target.append(el('p', `${state.boats.find(b => b.uid === failure.uid)?.name || failure.uid} · ${failure.status === 'BLOCKED' ? '접근 제한' : '확인 불가'} · 최근 수집 실패 기록이 있습니다.`, 'notice'));
  }
  const tideDetails=el('details','','day-tide-details');tideDetails.append(el('summary','이 날짜의 물때 상세'));
  renderDayTide(tideDetails,day,calculateTideMonth(state.month,state.tideDays || []));target.append(tideDetails);
}
