import { type AppState, type Filter } from './models';
import { eventStatus } from './availabilityStore';
import { tierFor } from './tierStore';

export function visibleEvents(state: AppState, tier: Filter, search = '') {
  const selected = new Set(state.selectedUids);
  return state.events.filter(e => {
    const boat = state.boats.find(b => b.uid === e.uid);
    return selected.has(e.uid) && e.date.startsWith(state.month + '-') &&
      (tier === 'all' || tierFor(state, e.uid) === tier) &&
      (!search || `${boat?.name || e.uid} ${boat?.port || ''} ${e.trip}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  });
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
export function renderCalendar(target: HTMLElement, state: AppState, tier: Filter, search: string, selectedDay: string, onSelect: (day: string) => void): void {
  target.replaceChildren();
  const events = visibleEvents(state, tier, search);
  for (const weekday of ['일', '월', '화', '수', '목', '금', '토']) {
    const heading = document.createElement('span'); heading.className = 'weekday'; heading.textContent = weekday; target.append(heading);
  }
  for (const day of monthDays(state.month)) {
    if (!day) { const gap = document.createElement('span'); gap.className = 'calendar-gap'; target.append(gap); continue; }
    const records = events.filter(e => e.date === day);
    const verified = records.filter(e => eventStatus(e, state) === 'AVAILABLE').length;
    const button = document.createElement('button'); button.className = 'calendar-day'; button.type = 'button';
    button.setAttribute('aria-label', `${day} · 기록 ${records.length}건`); button.setAttribute('aria-pressed', String(day === selectedDay));
    const num = document.createElement('span'); num.textContent = String(Number(day.slice(8))); button.append(num);
    const count = document.createElement('small'); count.textContent = records.length ? `${records.length}건` : '—'; button.append(count);
    if (verified) { const mark = document.createElement('i'); mark.textContent = '가능'; button.append(mark); }
    if (records.length) button.classList.add('has-records');
    button.addEventListener('click', () => onSelect(day)); target.append(button);
  }
}
