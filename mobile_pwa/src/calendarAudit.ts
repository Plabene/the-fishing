import {emptyState,type Boat} from './models';
import type {ProviderResult} from './provider';
import {applyLiveResults} from './liveQuery';
import {freshQueryView} from './freshResults';
import {queryMonth} from './monthlyQuery';

/** Run real storage/view transformations, with presentation filters explicitly cleared. */
export function auditCalendar(boat:Boat,month:string,source:ProviderResult,client:ProviderResult) {
  if(source.status!=='ALLOWED_READABLE' || client.status!=='ALLOWED_READABLE') return {classification:'SOURCE_FAILED',sourceEvents:source.events.filter(e=>e.uid===boat.uid).length,calendarEvents:0,missingIds:[],extraIds:[]};
  const state={...emptyState(),month,boats:[boat],selectedUids:[boat.uid],selectedSpecies:'all',excludedSpeciesKeys:[],tiers:{tier1:[],tier2:[],tier3:[],other:[boat.uid]}};
  const rows=[{boat,result:client}],stored=applyLiveResults(state,month,rows),view=freshQueryView(stored,month,rows);
  const calendar=queryMonth(view,{month,requiredPeople:1,tier:'all',search:'',matchingOnly:false,species:'all',excludedSpeciesKeys:[]});
  const sourceEvents=source.events.filter(e=>e.uid===boat.uid),key=(e:typeof sourceEvents[number])=>`${e.uid}/${e.id}/${e.date}`;
  const expected=new Set(sourceEvents.map(key)),actual=new Set(calendar.events.map(key));
  const missingIds=[...expected].filter(k=>!actual.has(k)),extraIds=[...actual].filter(k=>!expected.has(k));
  const mismatch=missingIds.length || extraIds.length || sourceEvents.length!==calendar.events.length || calendar.checkedCount!==1;
  return {classification:mismatch?'CALENDAR_MISMATCH':sourceEvents.length?'NORMAL_CALENDAR':'NO_PUBLISHED_SCHEDULE',sourceEvents:sourceEvents.length,calendarEvents:calendar.events.length,missingIds,extraIds};
}
