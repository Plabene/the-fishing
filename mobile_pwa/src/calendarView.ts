import { type AppState, type Filter } from './models';
import { queryMonth } from './monthlyQuery';
import { displayedSpecies, speciesColor, speciesLabel } from './species';
import { regionalTideMonth } from './tideRegion';
import { addTideToCell } from './tideView';
import {calendarStatus} from './calendarStatus';
import {retainFocus} from './uiFocus';

export function visibleEvents(state: AppState, tier: Filter, search = '', matchingOnly=false) {
  return queryMonth(state,{month:state.month,requiredPeople:state.requiredPeople,tier,search,matchingOnly}).events;
}
export function monthDays(month: string): (string | null)[] {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const values: (string | null)[] = Array(start).fill(null);
  for (let i = 1; i <= days; i++) values.push(`${month}-${String(i).padStart(2, '0')}`);
  while (values.length % 7) values.push(null);
  return values;
}
export function renderCalendar(target: HTMLElement, state: AppState, tier: Filter, search: string, selectedDay: string, onSelect: (day: string, keyboard?:boolean) => void, matchingOnly=false, result?:ReturnType<typeof queryMonth>): void {
  const restoreFocus=retainFocus(target);
  target.replaceChildren();
  const tide=regionalTideMonth(state,tier);
  const query=result ?? queryMonth(state,{month:state.month,requiredPeople:state.requiredPeople,tier,search,matchingOnly});
  const events = query.events;
  const byDay=new Map<string,typeof events>(),boats=new Map(state.boats.map(b=>[b.uid,b]));
  for(const event of events) {const day=byDay.get(event.date) || [];day.push(event);byDay.set(event.date,day);}
  for (const weekday of ['일', '월', '화', '수', '목', '금', '토']) {
    const heading = document.createElement('span'); heading.className = 'weekday'; heading.textContent = weekday; target.append(heading);
  }
  for (const day of monthDays(state.month)) {
    if (!day) { const gap = document.createElement('span'); gap.className = 'calendar-gap'; target.append(gap); continue; }
    const records = byDay.get(day) || [];
    const button = document.createElement('button'); button.className = 'calendar-day'; button.type = 'button';button.dataset.date=day;
    button.setAttribute('aria-label', `${day} · 일정 ${records.length}건`); button.setAttribute('aria-pressed', String(day === selectedDay));
    const num = document.createElement('span'); num.textContent = String(Number(day.slice(8))); button.append(num);
    addTideToCell(button,day,tide);
    const status=calendarStatus(state,query,day);button.dataset.availability=status.kind;
    const count = document.createElement('small'); count.textContent = status.label;count.className='calendar-availability'; button.append(count);
    button.setAttribute('aria-label',`${button.getAttribute('aria-label')} · ${status.label}${query.missingBoats.length?' · 미확인 선박 있음':''}`);
    const visibleIds=[...new Set(records.map(e=>e.uid))],previewIds=visibleIds.slice(0,2),remaining=visibleIds.length-previewIds.length;
    for (const id of previewIds) {
      const trips=records.filter(e=>e.uid===id),keys=[...new Set(trips.map(e=>displayedSpecies(e)))];
      const label=document.createElement('span'); label.className='calendar-boat';label.style.backgroundColor=speciesColor(keys[0]);
      const boatName=boats.get(id)?.name || id;
      const name=document.createElement('span');name.className='calendar-boat-name';name.textContent=boatName;name.title=boatName;
      const species=document.createElement('span');species.className='calendar-boat-species';species.textContent=keys.map(speciesLabel).join(' / ');
      label.append(name,species);label.title=[boatName,...keys.map(speciesLabel)].join('\n');button.append(label);
    }
    if(remaining) {const more=document.createElement('span');more.className='calendar-overflow';more.textContent=`+${remaining}척 더 보기`;button.append(more);}
    button.setAttribute('aria-label',`${button.getAttribute('aria-label')} · 표시 대상 선박 ${visibleIds.length}척${remaining?` · 미리보기 외 ${remaining}척 · 날짜 선택으로 전체 보기`:''}`);
    if (records.length) button.classList.add('has-records');
    button.addEventListener('click', event => onSelect(day,event.detail===0)); target.append(button);
  }
  restoreFocus();
}
