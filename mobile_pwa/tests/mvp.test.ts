import { expect, test } from 'vitest';
import 'fake-indexeddb/auto';
import { emptyState, officialDetail, timestamp, dateOnly } from '../src/models';
import { importData, exportData } from '../src/importLegacy';
import { normalizeTiers, moveBoat, removeBoat, orderedBoats } from '../src/tierStore';
import { monthDays, visibleEvents } from '../src/calendarView';
import { eventStatus, saveState, loadState } from '../src/availabilityStore';
import { fixtureState } from '../src/providers/fixtures';
import { TheFishingDirect } from '../src/providers/thefishingDirect';
import { classifyProbe, LIVE_ENABLED } from '../src/provider';

test('legacy four-tier order and independent selection round-trip', () => {
  const state = importData({boat_tiers: {tier1:['2','1','2'],tier2:['1','3'],tier3:['4'],other:['5']},selected_boat_uids:['3','2'],selected_year:2026,selected_month:9}).state;
  expect(state.tiers).toEqual({tier1:['2','1'],tier2:['3'],tier3:['4'],other:['5']});
  expect(state.selectedUids).toEqual(['3','2']); expect(importData(JSON.parse(exportData(state))).state).toEqual(state);
});
test('explicit empty selection stays empty', () => {
  const state = fixtureState('2026-10'); state.selectedUids=[];
  expect(importData(JSON.parse(exportData(state))).state.selectedUids).toEqual([]);
  expect(visibleEvents(state,'all')).toEqual([]);
});
test('duplicate catalog UID uses last value; missing UID warns', () => {
  const r = importData({entries:{a:{boat_uid:'1',boat_name:'A'},b:{boat_uid:'1',boat_name:'B'},c:{boat_uid:''}}});
  expect(r.state.boats.map(b=>b.name)).toEqual(['B']); expect(r.warnings).toHaveLength(2);
});
test('catalog and preferences may arrive in either order', () => {
  const catalog={entries:{one:{boat_uid:'1',boat_name:'배'}}}, prefs={boat_tiers:{tier1:['1']},selected_boat_uids:['1']};
  expect(importData(catalog,importData(prefs).state).state).toEqual(importData(prefs,importData(catalog).state).state);
});
test('selection-only UID retains position and placeholder', () => {
  const r=importData({selected_boat_uids:['77']}); expect(r.state.tiers.other).toEqual(['77']); expect(r.warnings[0]).toContain('77');
});
test('legacy normalizes external stable IDs and Unicode digits', () => {
  expect(normalizeTiers({tier1:['１２','ext:boat-1','bad?token=x']})).toEqual({tier1:['12','ext:boat-1'],tier2:[],tier3:[],other:[]});
});
test('move within and across tiers; deletion removes only target records', () => {
  const state=fixtureState('2026-10'); moveBoat(state,'demo-2','tier1'); moveBoat(state,'demo-2','tier1',-1);
  expect(orderedBoats(state).map(b=>b.uid)).toEqual(['demo-2','demo-1','demo-3']); removeBoat(state,'demo-1');
  expect(state.events).toHaveLength(8); expect(state.selectedUids).not.toContain('demo-1');
});
test('calendar has valid leap days and whole weeks', () => {
  expect(monthDays('2028-02').filter(Boolean)).toHaveLength(29); expect(monthDays('2026-02').filter(Boolean)).toHaveLength(28); expect(monthDays('2026-10').length%7).toBe(0);
});
test('day and tier filters retain event details', () => {
  const state=fixtureState('2026-10'); const events=visibleEvents(state,'tier1','주꾸미');
  expect(events).toHaveLength(4); expect(events[0].remaining).toBe(4); expect(events[0].departure).toBe('05:30');
});
test('missing seats and timestamp never become sold out or available', () => {
  const state=fixtureState('2026-10'), event=state.events[0]; event.source='imported';event.verified=true;
  expect(eventStatus(event,state)).toBe('UNKNOWN'); event.observedAt=new Date().toISOString(); event.remaining=null;
  expect(eventStatus(event,state)).toBe('UNKNOWN'); event.remaining=0; expect(eventStatus(event,state)).toBe('STALE');
});
test('new failure invalidates previous successful snapshot', () => {
  const state=fixtureState('2026-10'), event=state.events[0]; event.source='imported';event.verified=true;event.observedAt='2026-10-01T00:00:00Z';
  state.failures=[{uid:event.uid,month:'2026-10',observedAt:'2026-10-02T00:00:00Z',status:'UNKNOWN',code:'timeout'}]; expect(eventStatus(event,state)).toBe('UNKNOWN');
});
test('older import cannot overwrite newer observation', () => {
  const result=(time:string,seats:number)=>({completed_at:time,events:[{boat_uid:'1',boat_name:'배',date:'2026-10-09',event_id:'a',remaining_seats:seats,verified:true}]});
  const state=importData(result('2026-10-02T00:00:00Z',3)).state;
  expect(importData(result('2026-10-01T00:00:00Z',9),state).state.events[0].remaining).toBe(3);
});
test('export drops applicant secrets and redacts contact-shaped text', () => {
  const raw={...fixtureState('2026-10'),cookie:'private-cookie',applicant:{name:'private-name',phone:'010-1234-5678'}};
  raw.boats[0].name='선박 010-1234-5678 a@example.test';const out=exportData(raw);
  for(const value of ['private-cookie','private-name','010-1234-5678','a@example.test']) expect(out).not.toContain(value);
});
test.each(['javascript:alert(1)','http://thefishing.kr/reservation/list.php?uid=1','https://evil.test/reservation/list.php?uid=1','https://thefishing.kr/reservation/list.php?uid=1&uid=2','https://thefishing.kr/reservation/list.php?uid=1#secret','https://user:pass@thefishing.kr/reservation/list.php?uid=1'])('reject unsafe official link %s',url=>expect(officialDetail(url)).toBe(''));
test('invalid dates and timezone-less observations remain unknown',()=>{expect(dateOnly('2026-02-30')).toBeNull();expect(timestamp('2026-10-01T10:00:00')).toBeNull();});
test('aborted storage preserves previously saved state',async()=>{const state=emptyState();await saveState(state);const signal=AbortSignal.abort();await expect(saveState(fixtureState('2026-10'),signal)).rejects.toThrow();expect(await loadState()).toEqual(state);});
test('manual direct-query feature is enabled without claiming source verification',()=>{expect(LIVE_ENABLED).toBe(true);expect(classifyProbe({})).toBe('UNVERIFIED');});

test.each([[{},'UNVERIFIED'],[{status:403},'ACCESS_RESTRICTED'],[{status:429},'ACCESS_RESTRICTED'],[{status:401},'AUTH_OR_COOKIE_BLOCKED'],[{corsDeniedProven:true},'CORS_DENIED'],[{permissionDenied:true},'PERMISSION_DENIED'],[{status:200,bodyReadable:true,parserSupported:false},'PARSER_UNSUPPORTED'],[{status:200,bodyReadable:true,parserSupported:true},'ALLOWED_READABLE']] as const)('classifies evidence without guessing: %j',(e,status)=>expect(classifyProbe(e)).toBe(status));
