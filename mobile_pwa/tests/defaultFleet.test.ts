import { expect, test } from 'vitest';
import seed from '../src/data/defaultFleet.json';
import sourceLinks from '../src/data/sourceLinks.json';
import sunsang from '../src/data/sunsang24Fleet.json';
const additions=sunsang.boats.filter(b=>!seed.state.boats.some(old=>old.uid===b.uid)).length;
import { defaultFleet, initializeFleet, applyDefaultFleet, FLEET_VERSION } from '../src/defaultFleet';
import { emptyState, reservationLink, uid } from '../src/models';
import { importData, exportData } from '../src/importLegacy';
import { removeBoat, moveBoat } from '../src/tierStore';

test('PC seed contains all saved native boats plus active external and fleet members',()=>{
  const state=defaultFleet();
  expect(state.boats.length).toBeGreaterThanOrEqual(512);
  expect(state.boats).toHaveLength(seed.state.boats.length+additions);
  expect(state.selectedUids).toHaveLength(104);
  expect(Object.values(state.tiers).map(v=>v.length)).toEqual([17,14,20,53]);
  expect(state.selectedUids.slice(0,83)).toEqual(seed.state.selectedUids);
  for(const tier of ['tier1','tier2','tier3','other'] as const) expect(state.tiers[tier].slice(0,seed.state.tiers[tier].length)).toEqual(seed.state.tiers[tier]);
  expect(state.events).toEqual([]); expect(state.failures).toEqual([]);
  expect(state.boats.filter(b=>state.selectedUids.includes(b.uid)).every(b=>b.url && b.name)).toBe(true);
  expect(importData(JSON.parse(exportData(state))).state).toEqual(state);
});
test('Korean fleet identity and selected external boat survive import without placeholders',()=>{
  const state=defaultFleet(), id='thefishing-fleet:348:팀베테랑호';
  expect(uid(id)).toBe(id); expect(state.selectedUids).toContain(id);
  expect(state.boats.find(b=>b.uid===id)?.name).toBe('팀베테랑호');
  expect(state.boats.find(b=>b.uid==='external:3e13428ab1e484d50b7e')?.name).toBe('팀한프로[한프로선장]');
});
test('only exact registered external/fleet links are accepted for navigation',()=>{
  for (const [id,url] of Object.entries(sourceLinks)) {
    expect(reservationLink(url,id)).toBe(url);
    expect(reservationLink(url+'&token=secret',id)).toBe('');
    expect(reservationLink(url,'external:unregistered')).toBe('');
  }
  expect(reservationLink('https://thefishing.kr/reservation/list.php?uid=5383','5383')).toContain('uid=5383');
  expect(reservationLink('https://thefishing.kr/reservation/list.php?uid=5383','5268')).toBe('');
  expect(reservationLink('https://evil.example','external:3e13428ab1e484d50b7e')).toBe('');
  expect(reservationLink('javascript:alert(1)','5383')).toBe('');
  expect(reservationLink('https://evil.example','__proto__')).toBe('');
});
test('first visit and previous empty MVP state receive the PC fleet',()=>{
  expect(initializeFleet(undefined).state.selectedUids).toHaveLength(104);
  expect(initializeFleet(emptyState()).seeded).toBe(true);
});
test('existing custom boats and explicit empty selections are preserved',()=>{
  const state=defaultFleet(); moveBoat(state,'5383','tier3'); state.selectedUids=[];
  const loaded=initializeFleet(state);
  expect(loaded.seeded).toBe(false); expect(loaded.state).toEqual(state);
  const custom={...emptyState(),boats:[{uid:'12',name:'내 선박',port:'항구',url:''}]};
  expect(initializeFleet(custom).state.boats).toEqual(custom.boats);
});
test('deleting every inherited boat is not undone on reload',()=>{
  const state=defaultFleet(); for (const b of [...state.boats]) removeBoat(state,b.uid);
  expect(initializeFleet(state).state.boats).toEqual([]);
  expect(initializeFleet(state).seeded).toBe(false);
});
test('explicit restore keeps custom boats, observations, and current month',()=>{
  const state=emptyState(); state.month='2027-01'; state.boats=[{uid:'12-custom',name:'내 배',port:'항구',url:''}];
  state.selectedUids=['12-custom']; state.tiers.tier2=['12-custom'];
  state.events=[{id:'old',uid:'5383',date:'2026-11-02',trip:'이전 기록',port:'항구',departure:'05:00',remaining:1,verified:true,observedAt:null,source:'imported'}];
  const restored=applyDefaultFleet(state);
  expect(restored.boats).toHaveLength(seed.state.boats.length+additions+1); expect(restored.selectedUids.at(-1)).toBe('12-custom');
  expect(restored.tiers.tier2.at(-1)).toBe('12-custom');
  expect(restored.events).toEqual(state.events); expect(restored.month).toBe('2027-01');
  expect(restored.fleetSeedVersion).toBe(FLEET_VERSION);
  expect(state.boats).toHaveLength(1);
});
test('bundled data contains only fleet fields and no cached seats or PC settings',()=>{
  for (const boat of seed.state.boats) {
    expect(Object.keys(boat).filter(key=>key!=='region').sort()).toEqual(['name','port','uid','url']);
    if ('region' in boat) expect(Object.keys(boat.region!).sort()).toEqual(['local','province','sea']);
  }
  const value=JSON.stringify(seed);
  for (const key of ['cookie','password','applicant','export_directory','operator_name','phone','token','session']) expect(value).not.toContain(`"${key}"`);
  expect(value).not.toMatch(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
});
