import {expect,test} from 'vitest';
import {defaultFleet} from '../src/defaultFleet';
import {TIERS} from '../src/models';
import {applyPublishedPreferences} from '../src/publishedPreferences';
import {RECOVERY_VERSION,initializePreferenceRecovery,recoverPreferences,suppliedPreferences} from '../src/preferenceRecovery';
import previous from '../src/data/previousTierRecovery.json';
import published from '../src/data/publishedPreferences.json';
import {tierQueryBoats} from '../src/tierQuery';
import {exportTierBackup,restoreTierBackup} from '../src/tierBackup';

test('October 27 merge retains all 117 out-of-file assignments, adds 25 and moves only the three recorded identities',()=>{
  const before={...defaultFleet(),tiers:structuredClone(previous.tiers),selectedUids:[...previous.selectedUids],preferenceRecoveryVersion:previous.version};
  const scope=new Set(suppliedPreferences.scopeUids),oldAssigned=new Map(TIERS.flatMap(t=>before.tiers[t].map(id=>[id,t])));
  const outside=[...oldAssigned.keys()].filter(id=>!scope.has(id));expect(outside).toHaveLength(117);
  const upgraded=initializePreferenceRecovery(before,true);expect(upgraded.restored).toBe(143);expect(upgraded.state.tiers).toEqual(published.tiers);expect(upgraded.state.selectedUids).toEqual(published.selectedUids);
  expect(TIERS.map(t=>upgraded.state.tiers[t].length)).toEqual([17,25,34,184]);expect(tierQueryBoats(upgraded.state,'all')).toHaveLength(260);
  const now=new Map(TIERS.flatMap(t=>upgraded.state.tiers[t].map(id=>[id,t])));for(const id of outside)expect(now.get(id)).toBe(oldAssigned.get(id));
  expect([...oldAssigned.keys()].filter(id=>!now.has(id))).toEqual([]);expect([...now.keys()].filter(id=>!oldAssigned.has(id))).toHaveLength(25);
  expect([...now.keys()].filter(id=>oldAssigned.has(id)&&now.get(id)!==oldAssigned.get(id)).sort()).toEqual(['3487','sunsang24:ship:853','sunsang24:ship:944'].sort());
  expect(upgraded.state.boats).toEqual(before.boats);expect(upgraded.state.events).toEqual(before.events);expect(upgraded.state.preferenceRecoveryVersion).toBe(RECOVERY_VERSION);expect(initializePreferenceRecovery(upgraded.state,true).restored).toBe(0);
  expect(applyPublishedPreferences(defaultFleet(),true).tiers).toEqual(upgraded.state.tiers);
});

test('personal edits are not overwritten on update; explicit file merge preserves a different out-of-file personal tier',()=>{
  const before={...defaultFleet(),tiers:structuredClone(previous.tiers),selectedUids:[...previous.selectedUids],preferenceRecoveryVersion:previous.version};
  for(const tier of TIERS) before.tiers[tier]=before.tiers[tier].filter(id=>id!=='6104');before.tiers.tier1.push('6104');
  const untouched=initializePreferenceRecovery(before,true);expect(untouched.restored).toBe(0);expect(untouched.state.tiers).toEqual(before.tiers);
  const merged=recoverPreferences(untouched.state,suppliedPreferences,'exact').state;expect(merged.tiers.tier1).toContain('6104');expect(merged.tiers.tier2).toContain('sunsang24:ship:944');
  const portable=restoreTierBackup(JSON.parse(exportTierBackup(merged)),before).state;expect(portable.tiers).toEqual(merged.tiers);expect(portable.selectedUids).toEqual(merged.selectedUids);
  const known=new Map(defaultFleet().boats.map(b=>[b.uid,b]));for(const boat of suppliedPreferences.boats || []) expect(boat).toEqual(known.get(boat.uid));
});
