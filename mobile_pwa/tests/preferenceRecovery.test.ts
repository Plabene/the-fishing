import {expect,test} from 'vitest';
import {defaultFleet,initializeFleet} from '../src/defaultFleet';
import {emptyState,TIERS} from '../src/models';
import {applyPublishedPreferences} from '../src/publishedPreferences';
import {RECOVERY_VERSION,initializePreferenceRecovery,recoverPreferences,suppliedPreferences,recoveryPreview} from '../src/preferenceRecovery';
import {exportTierBackup,restoreTierBackup} from '../src/tierBackup';
import {importData,exportData} from '../src/importLegacy';
import previous from '../src/data/previousTierRecovery.json';

test('latest full backup retains exact 235 tier assignments and 126 selections including 10 unassigned boats',()=>{
  const result=recoverPreferences(emptyState(),suppliedPreferences,'exact');
  expect(result.count).toBe(235);expect(result.unresolved).toBe(0);expect(result.state.boats).toHaveLength(245);
  expect(TIERS.map(t=>result.state.tiers[t].length)).toEqual([16,21,31,167]);
  expect(result.state.tiers).toEqual(suppliedPreferences.tiers);expect(result.state.selectedUids).toEqual(suppliedPreferences.selectedUids);
  expect(result.state.selectedUids.filter(id=>!TIERS.some(t=>result.state.tiers[t].includes(id)))).toHaveLength(10);
  const portable=restoreTierBackup(JSON.parse(exportTierBackup(result.state)),emptyState()).state;
  expect(portable.tiers).toEqual(suppliedPreferences.tiers);expect(portable.selectedUids).toEqual(suppliedPreferences.selectedUids);
});
test('catalog and preset upgrades preserve personal tiers even if the preset version marker is missing',()=>{
  const current=defaultFleet();current.tiers={tier1:[],tier2:[current.boats[0].uid],tier3:[],other:[]};current.selectedUids=[];delete current.publishedPreferencesVersion;
  const next=applyPublishedPreferences(initializeFleet(current).state);
  expect(next.tiers).toEqual(current.tiers);expect(next.selectedUids).toEqual([]);
});
test('gap recovery preserves conflicting personal tiers and selections; exact recovery changes only backup scope',()=>{
  const current=defaultFleet(),id=suppliedPreferences.tiers.tier1[0];current.tiers={tier1:['personal'],tier2:[id],tier3:[],other:[]};current.selectedUids=['personal'];
  current.boats.push({uid:'personal',name:'개인 추가호',port:'',url:''});const before=structuredClone(current);
  expect(recoveryPreview(current,suppliedPreferences).conflicts).toBe(1);
  const missing=recoverPreferences(current,suppliedPreferences,'missing').state;
  expect(missing.tiers.tier2).toContain(id);expect(missing.tiers.tier1).toContain('personal');expect(missing.selectedUids).toContain('personal');
  const exact=recoverPreferences(current,suppliedPreferences,'exact').state;
  expect(exact.tiers.tier1).toContain(id);expect(exact.tiers.tier2).not.toContain(id);expect(exact.tiers.tier1).toContain('personal');expect(current).toEqual(before);
});
test('only empty matching catalogs recover automatically once; later intentional clears and custom catalogs stay empty',()=>{
  const current=defaultFleet();current.tiers={tier1:[],tier2:[],tier3:[],other:[]};current.selectedUids=[];
  const recovered=initializePreferenceRecovery(current,true);expect(recovered.restored).toBe(235);
  recovered.state.tiers={tier1:[],tier2:[],tier3:[],other:[]};expect(initializePreferenceRecovery(recovered.state,true).restored).toBe(0);
  expect(initializePreferenceRecovery(emptyState(),true).restored).toBe(0);
  const restored=importData(JSON.parse(exportData(recovered.state))).state;expect(restored.preferenceRecoveryVersion).toBe(RECOVERY_VERSION);
});
test('unidentified backup IDs are reported without invented identities or tiers',()=>{
  const backup={tiers:{tier1:['unknown'],tier2:[],tier3:[],other:[]},selectedUids:['unknown']};
  const result=recoverPreferences(emptyState(),backup,'exact');expect(result.count).toBe(0);expect(result.unresolved).toBe(1);expect(result.state.boats).toHaveLength(0);
});
test('future PC tier migrations and an intentionally empty protected catalog do not reset personal preferences',()=>{
  const state=defaultFleet();state.preferenceRecoveryVersion=RECOVERY_VERSION;delete state.sunsangTierVersion;
  state.tiers={tier1:[],tier2:[],tier3:[],other:[]};state.selectedUids=[];
  const next=initializeFleet(state).state;expect(next.tiers).toEqual(state.tiers);expect(next.selectedUids).toEqual([]);
  const empty={...emptyState(),preferenceRecoveryVersion:RECOVERY_VERSION};
  expect(initializeFleet(empty).seeded).toBe(false);expect(initializeFleet(empty).state.boats).toEqual([]);
});

test('full backup applies explicit cleared tiers while retaining vessels, custom scope and all observations/filters',()=>{
  const current={...defaultFleet(),tiers:structuredClone(previous.tiers),selectedUids:[...previous.selectedUids]};
  current.boats.push({uid:'personal',name:'새 개인 선박',port:'',url:''});current.tiers.tier1.push('personal');current.selectedUids.push('personal');
  current.selectedTiers=['tier2'];current.selectedSpecies={mode:'options',keys:['문어']};
  const before=structuredClone(current),p=recoveryPreview(current,suppliedPreferences);
  expect(p.cleared).toBe(10);expect(p.conflicts).toBe(1);
  const missing=recoverPreferences(current,suppliedPreferences,'missing').state;
  expect(missing.tiers.tier1).toContain('sunsang24:ship:1371'); // gap fill never clears a personal tier
  const exact=recoverPreferences(current,suppliedPreferences,'exact').state;
  for(const tier of TIERS) expect(exact.tiers[tier].filter(id=>id!=='personal')).toEqual(suppliedPreferences.tiers[tier]);
  expect(exact.selectedUids).toEqual([...suppliedPreferences.selectedUids,'personal']);
  expect(exact.boats).toEqual(before.boats);expect(exact.events).toEqual(before.events);expect(exact.selectedTiers).toEqual(before.selectedTiers);expect(exact.selectedSpecies).toEqual(before.selectedSpecies);
  expect(exact.tiers.tier3).toContain('sunsang24:ship:944');
  expect(TIERS.flatMap(t=>exact.tiers[t])).not.toContain('sunsang24:ship:1371');expect(exact.boats.some(b=>b.uid==='sunsang24:ship:1371')).toBe(true);
  expect(current).toEqual(before);
  const file=JSON.parse(exportTierBackup(exact,new Date(),suppliedPreferences.scopeUids));
  const portable=restoreTierBackup(file,current).state;
  expect(portable.tiers).toEqual(exact.tiers);expect(portable.selectedUids).toEqual(exact.selectedUids);
  expect(file.boats.some((b:{uid:string})=>b.uid==='sunsang24:ship:1371')).toBe(true);
  expect(file.events).toBeUndefined();expect(file.selectedRegion).toBeUndefined();
});
