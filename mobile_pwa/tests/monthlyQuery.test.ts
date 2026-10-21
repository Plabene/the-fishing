import { expect, test } from 'vitest';
import { defaultFleet } from '../src/defaultFleet';
import { initializeMonthlyArchive } from '../src/monthlyArchive';
import { queryMonth, type MonthQuery } from '../src/monthlyQuery';
import { importData, exportData } from '../src/importLegacy';
import { emptyState, type AppState } from '../src/models';
import { eventStatus } from '../src/availabilityStore';
import { removeBoat } from '../src/tierStore';
import archive from '../src/data/monthlyArchive.json';

const q:MonthQuery={month:'2026-10',requiredPeople:2,tier:'all',search:'',matchingOnly:true};
function state():AppState {
  const s=emptyState(); s.month=q.month; s.selectedUids=['2','1','3'];
  s.boats=[{uid:'1',name:'알파호',port:'오천',url:''},{uid:'2',name:'베타호',port:'인천',url:''},{uid:'3',name:'미조회호',port:'부산',url:''}];
  s.tiers.tier1=['2','1']; s.tiers.other=['3'];
  s.events=[['a','1',5],['b','2',2],['c','2',1],['d','1',null]].map(([id,uid,remaining])=>({id:String(id),uid:String(uid),remaining:remaining as number|null,date:'2026-10-09',trip:'주꾸미',species:'주꾸미',port:'',departure:'05:00',verified:true,source:'imported',observedAt:'2026-10-01T15:00:00+09:00'}));
  return s;
}
test('monthly query combines seats, selection, tiers, text and date with tier ordering',()=>{
  const s=state(), result=queryMonth(s,q);
  expect(result.events.map(e=>e.id)).toEqual(['b','a']); expect(result.days).toEqual(['2026-10-09']);
  expect(queryMonth(s,{...q,requiredPeople:3}).events.map(e=>e.id)).toEqual(['a']);
  expect(queryMonth(s,{...q,search:'오천'}).events.map(e=>e.id)).toEqual(['a']);
  expect(queryMonth(s,{...q,search:'주꾸미'}).events).toHaveLength(2);
  expect(queryMonth(s,{...q,tier:'other'}).events).toEqual([]);
  expect(queryMonth(s,{...q,month:'2026-11'}).events).toEqual([]);
  s.selectedUids=['2']; expect(queryMonth(s,q).events.map(e=>e.id)).toEqual(['b']);
});
test('unknown seats and failures are never counted as matching or live availability',()=>{
  const s=state(); s.failures=[{uid:'1',month:q.month,observedAt:'2026-10-02T00:00:00Z',status:'BLOCKED',code:'403'}];
  const result=queryMonth(s,q); expect(result.events.map(e=>e.id)).toEqual(['b']); expect(result.liveCount).toBe(0);
  expect(queryMonth(s,{...q,matchingOnly:false}).events).toHaveLength(4);
  expect(eventStatus(s.events[0],s)).toBe('BLOCKED');
  expect(result.missingBoats.map(b=>b.uid)).toEqual(['3']);
});
test('empty successful PC query is distinguishable from a boat with no data',()=>{
  const s=state(); s.monthChecks=[{uid:'3',month:q.month,requiredPeople:1,observedAt:'2026-10-01T15:00:00+09:00'}];
  const result=queryMonth(s,q); expect(result.checkedCount).toBe(3); expect(result.missingBoats).toEqual([]);
  expect(result.liveCount).toBe(0);
});
test('invalid query cannot execute',()=>{
  for (const requiredPeople of [0,101,1.5,NaN]) expect(()=>queryMonth(state(),{...q,requiredPeople})).toThrow();
  expect(()=>queryMonth(state(),{...q,month:'2026-13'})).toThrow();
});
test('archive migrates once, preserves newer observations, and cannot restore removed boats',()=>{
  const fleet=defaultFleet(), first=initializeMonthlyArchive(fleet);
  expect(first.changed).toBe(true); expect(first.state.events).toHaveLength(1744);
  expect(first.state.events.every(e=>e.source==='imported')).toBe(true);
  expect(queryMonth(first.state,{...q,requiredPeople:1}).liveCount).toBe(0);
  expect(initializeMonthlyArchive(first.state).changed).toBe(false);
  const existing=first.state.events[0]; existing.observedAt='2026-10-02T00:00:00Z';existing.remaining=88;
  delete first.state.monthlyArchiveVersion;
  const again=initializeMonthlyArchive(first.state).state;
  expect(again.events.find(e=>e.id===existing.id)?.remaining).toBe(88);
  removeBoat(again,existing.uid); delete again.monthlyArchiveVersion;
  expect(initializeMonthlyArchive(again).state.events.some(e=>e.uid===existing.uid)).toBe(false);
  expect(importData(JSON.parse(exportData(again))).state).toEqual(again);
});
test('raw PC cache chooses broadest complete query instead of duplicating request variants',()=>{
  const result=(people:number,id:string)=>({completed_at:'2026-10-01T15:00:00+09:00',query:{year:2026,month:10,required_people:people,boat_uids:['1']},events:[{event_id:id,boat_uid:'1',date:'2026-10-09',trip_name:'주꾸미',species_label:'주꾸미',price_won:90000,remaining_seats:5,verified:true}]});
  const imported=importData({entries:{one:{result:result(1,'broad')},two:{result:result(2,'narrow')}}},state()).state;
  expect(imported.events.some(e=>e.id==='broad')).toBe(true); expect(imported.events.some(e=>e.id==='narrow')).toBe(false);
  expect(imported.monthChecks?.[0].requiredPeople).toBe(1);
  expect(imported.events.find(e=>e.id==='broad')?.price).toBe(90000);
});
test('archive contains public schedule fields only, without booking actions or personal data',()=>{
  for (const e of archive.events) expect(Object.keys(e).sort()).toEqual(['date','departure','id','observedAt','port','price','remaining','source','species','trip','uid','verified']);
  const serialized=JSON.stringify(archive);
  for (const key of ['reservation_action','option_id','applicant','cookie','password','phone']) expect(serialized).not.toContain(`"${key}"`);
  expect(serialized).not.toMatch(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
});
