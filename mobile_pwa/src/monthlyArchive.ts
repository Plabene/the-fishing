import archive from './data/monthlyArchive.json';
import { importData } from './importLegacy';
import { type AppState } from './models';

export const MONTHLY_ARCHIVE_VERSION=archive.version;
export const archivedMonths=[...new Set(archive.events.map(e=>e.date.slice(0,7)))].sort();
export function initializeMonthlyArchive(current: AppState): {state:AppState; changed:boolean} {
  if (current.monthlyArchiveVersion===archive.version) return {state:current,changed:false};
  const known=new Set(current.boats.map(b=>b.uid));
  const state=structuredClone(current);
  const incoming=importData({...current,events:archive.events.filter(e=>known.has(e.uid)),failures:[],monthChecks:archive.monthChecks.filter(c=>known.has(c.uid))}).state;
  for (const event of incoming.events) {
    const at=state.events.findIndex(e=>e.id===event.id && e.uid===event.uid && e.date===event.date);
    if (at<0) state.events.push(event);
    else if (Date.parse(event.observedAt || '')>Date.parse(state.events[at].observedAt || '')) state.events[at]=event;
  }
  for (const check of incoming.monthChecks || []) {
    const checks=state.monthChecks ||= [], at=checks.findIndex(c=>c.uid===check.uid && c.month===check.month && c.requiredPeople===check.requiredPeople);
    if (at<0) checks.push(check); else if (Date.parse(check.observedAt)>Date.parse(checks[at].observedAt)) checks[at]=check;
  }
  state.monthlyArchiveVersion=archive.version;
  return {state,changed:true};
}
