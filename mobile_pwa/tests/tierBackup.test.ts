import {expect,test} from 'vitest';
import {defaultFleet,initializeFleet,FLEET_VERSION} from '../src/defaultFleet';
import {applySunsangTiers,SUNSANG_TIER_VERSION} from '../src/sunsang24Tiers';
import seed from '../src/data/sunsang24Tiers.json';
import original from '../src/data/defaultFleet.json';
import {emptyState,TIERS} from '../src/models';
import {moveBoat,removeBoat,orderedBoats} from '../src/tierStore';
import {exportTierBackup,restoreTierBackup} from '../src/tierBackup';
import {importData,exportData} from '../src/importLegacy';
import {possibleDuplicateIds,duplicateCandidates} from '../src/platforms';

test('PC tier migration runs despite unchanged catalog version, preserving personal assignments and deletions',()=>{
  const state=defaultFleet();delete state.sunsangTierVersion;
  state.tiers=structuredClone(original.state.tiers);state.selectedUids=[...original.state.selectedUids];
  moveBoat(state,seed.tiers.tier1[0],'tier3');removeBoat(state,seed.tiers.tier1[1]);
  state.selectedUids.push(seed.tiers.tier1[2]);
  const upgraded=initializeFleet(state);
  expect(upgraded.changed).toBe(true);expect(upgraded.state.fleetSeedVersion).toBe(FLEET_VERSION);
  expect(upgraded.state.tiers.tier3).toContain(seed.tiers.tier1[0]);expect(upgraded.state.selectedUids).not.toContain(seed.tiers.tier1[0]);
  expect(upgraded.state.boats.some(b=>b.uid===seed.tiers.tier1[1])).toBe(false);
  expect(upgraded.state.tiers.tier1).toContain(seed.tiers.tier1[2]);
  expect(upgraded.state.selectedUids.filter(id=>id===seed.tiers.tier1[2])).toHaveLength(1);
  expect(upgraded.state.sunsangTierVersion).toBe(SUNSANG_TIER_VERSION);
  moveBoat(upgraded.state,seed.tiers.tier1[3],'tier2');upgraded.state.selectedUids=[];
  expect(initializeFleet(upgraded.state)).toEqual({state:upgraded.state,changed:false,seeded:false});
  expect(importData(JSON.parse(exportData(upgraded.state))).state.sunsangTierVersion).toBe(SUNSANG_TIER_VERSION);
});
test('explicit PC restore replaces only the 21 matching ships and keeps other platform/user data',()=>{
  const state=defaultFleet(),personal='sunsang24:ship:999999';
  state.boats.push({uid:personal,name:'개인 선박',port:'',url:''});moveBoat(state,personal,'tier1');
  moveBoat(state,seed.tiers.tier1[0],'tier3');removeBoat(state,seed.tiers.tier1[1]);
  state.selectedUids=[];state.month='2027-05';const before=structuredClone(state),next=applySunsangTiers(state,true);
  for(const tier of TIERS) expect(next.tiers[tier].filter(id=>seed.selectedUids.includes(id))).toEqual(seed.tiers[tier]);
  expect(next.tiers.tier1).toContain(personal);expect(next.tiers.tier1.filter(id=>!id.startsWith('sunsang24:'))).toEqual(original.state.tiers.tier1);
  expect(next.selectedUids).toEqual(seed.selectedUids);expect(next.month).toBe(state.month);expect(state).toEqual(before);
});
test('portable tier file preserves cross-platform order, unselected assignments and selected unassigned boats',()=>{
  const state=defaultFleet();state.selectedUids=[seed.selectedUids[0],state.boats.at(-1)!.uid];
  moveBoat(state,seed.selectedUids[0],'tier2');
  const raw=JSON.parse(exportTierBackup(state));
  expect(raw.boats.length).toBeLessThan(state.boats.length);
  expect(raw.events).toBeUndefined();expect(raw.fleetBaseline).toBeUndefined();expect(raw.sunsangTierVersion).toBeUndefined();
  const restored=restoreTierBackup(raw,emptyState()).state;
  for(const tier of TIERS) expect(restored.tiers[tier].slice(0,state.tiers[tier].length)).toEqual(state.tiers[tier]);
  expect(restored.selectedUids).toEqual(state.selectedUids);
  expect(JSON.parse(exportTierBackup(restored,new Date(raw.createdAt)))).toEqual(raw);
});
test('restoring tiers merges included IDs, keeps custom names and observations and resolves legacy aliases',()=>{
  const source=emptyState(),id='sunsang24:ship:1867';source.boats=[{uid:id,name:'더블케이호',port:'팔포항',url:'https://doublek.sunsang24.com/ship/schedule_fleet'}];source.tiers.tier2=[id];
  const file=JSON.parse(exportTierBackup(source)),canonical=file.boats[0].uid;expect(canonical).toBe('external:c4ebfacb32593d90a212');
  // Also accept a portable file using the original PC identity.
  file.boats[0].uid=id;file.tiers.tier2=[id];
  const current=defaultFleet();current.boats.find(b=>b.uid===canonical)!.name='내 별명';current.tiers.tier1.push(canonical);
  current.events=[{id:'obs',uid:canonical,date:'2026-10-25',trip:'문어',port:'',departure:'',remaining:3,verified:true,observedAt:null,source:'api'}];
  const before=structuredClone(current),restored=restoreTierBackup(file,current).state;
  expect(restored.boats.filter(b=>b.uid===canonical)).toHaveLength(1);expect(restored.boats.find(b=>b.uid===canonical)!.name).toBe('내 별명');
  expect(restored.tiers.tier2[0]).toBe(canonical);expect(restored.tiers.tier1).not.toContain(canonical);
  expect(restored.selectedUids).not.toContain(canonical);expect(restored.events).toEqual(current.events);expect(current).toEqual(before);
});
test('invalid or contradictory backups fail atomically; executable URLs never survive',()=>{
  const state=defaultFleet(),before=structuredClone(state),valid=JSON.parse(exportTierBackup(state));
  for(const mutate of [
    (v:any)=>v.version=2,(v:any)=>v.tiers.tier2.push(v.tiers.tier1[0]),
    (v:any)=>v.tiers.tier1.push('missing'),(v:any)=>v.selectedUids.push('missing'),
    (v:any)=>v.boats.push(v.boats[0]),(v:any)=>v.boats[0].uid='invalid/id',
  ]) {const v=structuredClone(valid);mutate(v);expect(()=>restoreTierBackup(v,state)).toThrow();expect(state).toEqual(before);}
  valid.boats[0].url='javascript:alert(1)';expect(restoreTierBackup(valid,emptyState()).state.boats[0].url).toBe('');
});
test('linear ordering and duplicate index match former behavior across the complete fleet',()=>{
  const state=defaultFleet(),order=[...TIERS.flatMap(t=>state.tiers[t]),...state.boats.map(b=>b.uid)];
  expect(orderedBoats(state)).toEqual([...new Set(order)].flatMap(id=>state.boats.filter(b=>b.uid===id)));
  const shared={name:'같은 이름',port:'오천항',region:{sea:'서해권',province:'충청남도',local:'보령'},url:''};
  state.boats.push({...shared,uid:'123456'},{...shared,uid:'sunsang24:ship:98765'});
  expect(possibleDuplicateIds(state.boats)).toEqual(new Set(state.boats.filter(b=>duplicateCandidates(b,state.boats).length).map(b=>b.uid)));
});
