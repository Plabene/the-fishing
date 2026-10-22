import { type AppState, type Filter } from './models';
import { eventStatus } from './availabilityStore';
import { queryMonth } from './monthlyQuery';
import { eventSpecies, speciesColor, speciesLabel } from './species';

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
export function renderCalendar(target: HTMLElement, state: AppState, tier: Filter, search: string, selectedDay: string, onSelect: (day: string) => void, matchingOnly=false, result?:ReturnType<typeof queryMonth>): void {
  target.replaceChildren();
  const events = result?.events ?? visibleEvents(state, tier, search,matchingOnly);
  const byDay=new Map<string,typeof events>(),boats=new Map(state.boats.map(b=>[b.uid,b]));
  for(const event of events) {const day=byDay.get(event.date) || [];day.push(event);byDay.set(event.date,day);}
  for (const weekday of ['일', '월', '화', '수', '목', '금', '토']) {
    const heading = document.createElement('span'); heading.className = 'weekday'; heading.textContent = weekday; target.append(heading);
  }
  for (const day of monthDays(state.month)) {
    if (!day) { const gap = document.createElement('span'); gap.className = 'calendar-gap'; target.append(gap); continue; }
    const records = byDay.get(day) || [];
    const verified = records.filter(e => eventStatus(e, state) === 'AVAILABLE').length;
    const button = document.createElement('button'); button.className = 'calendar-day'; button.type = 'button';
    button.setAttribute('aria-label', `${day} · 일정 ${records.length}건`); button.setAttribute('aria-pressed', String(day === selectedDay));
    const num = document.createElement('span'); num.textContent = String(Number(day.slice(8))); button.append(num);
    const count = document.createElement('small'); count.textContent = records.length ? `${records.length}건` : '—'; button.append(count);
    if (verified) { const mark = document.createElement('i'); mark.textContent = '가능'; button.append(mark); }
    for (const id of [...new Set(records.map(e=>e.uid))].slice(0,2)) {
      const trips=records.filter(e=>e.uid===id),keys=[...new Set(trips.map(eventSpecies))];
      const label=document.createElement('span'); label.className='calendar-boat';label.style.backgroundColor=speciesColor(keys[0]);
      label.textContent=`${boats.get(id)?.name || id} · ${keys.map(speciesLabel).join(' / ')}`;label.title=trips.map(e=>`${e.trip} · ${speciesLabel(eventSpecies(e))}`).join('\n');button.append(label);
    }
    if (records.length) button.classList.add('has-records');
    button.addEventListener('click', () => onSelect(day)); target.append(button);
  }
}
