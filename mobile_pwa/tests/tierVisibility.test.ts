import {expect,test} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,TIERS,type AppState,type Filter} from '../src/models';
import {toggleTierFilter} from '../src/tierStore';
import {tierVisibility} from '../src/tierVisibility';
import {recoverPreferences,suppliedPreferences,RECOVERY_VERSION} from '../src/preferenceRecovery';
import {loadState,saveState,preferenceBackups} from '../src/availabilityStore';
import {initializeFleet} from '../src/defaultFleet';
import {emptyRegion} from '../src/regions';

test('All starts the clicked tier; further clicks add/remove without inverting the first selection',()=>{
  for(const start of ['all',[...TIERS]] as Filter[]) for(const tier of TIERS) expect(toggleTierFilter(start,tier)).toEqual([tier]);
  let filter=toggleTierFilter('all','tier1');expect(filter).toEqual(['tier1']);
  filter=toggleTierFilter(filter,'tier2');expect(filter).toEqual(['tier1','tier2']);
  filter=toggleTierFilter(filter,'tier1');expect(filter).toEqual(['tier2']);
  expect(toggleTierFilter(filter,'tier2')).toEqual([]);
  expect(toggleTierFilter(filter,'all')).toBe('all');expect(toggleTierFilter(filter,'none')).toEqual([]);
  expect(toggleTierFilter([],'other')).toEqual(['other']);
});

test('last backup counts stay distinct from selection and filtered target counts without mutation',()=>{
  const state=recoverPreferences(emptyState(),suppliedPreferences,'exact').state,before=structuredClone(state);
  const all=tierVisibility(state,'all');
  expect(all.counts).toEqual({tier1:16,tier2:21,tier3:31,other:167});
  expect(all).toMatchObject({total:235,included:116,unselected:119,excludedTier:0,excludedLocation:0,missingBoat:0,unassignedSelected:10});
  expect(tierVisibility(state,['tier1'])).toMatchObject({included:16,excludedTier:100,total:235});
  expect(tierVisibility(state,[])).toMatchObject({included:0,excludedTier:116,total:235});
  state.selectedRegion={...emptyRegion(),province:'전라북도'};
  const limited=tierVisibility(state,['tier1']);
  expect(limited.included+limited.unselected+limited.excludedTier+limited.excludedLocation+limited.missingBoat).toBe(limited.total);
  expect(limited.total).toBe(235);expect(limited.excludedLocation).toBeGreaterThan(0);
  expect(state.tiers).toEqual(before.tiers);expect(state.selectedUids).toEqual(before.selectedUids);
});

test('filter writes, reload, month changes and catalog initialization preserve exact backup assignments and history',async()=>{
  const state=recoverPreferences(emptyState(),suppliedPreferences,'exact').state;state.preferenceRecoveryVersion=RECOVERY_VERSION;
  await saveState(state);const history=await preferenceBackups();
  for(const selectedTiers of [[],['tier1'],['tier1','tier2'],'all'] as Filter[]) {
    const loaded=await loadState() as AppState;
    await saveState({...loaded,selectedTiers,month:'2026-11'});
    const reloaded=await loadState() as AppState;
    expect(reloaded.tiers).toEqual(state.tiers);expect(reloaded.selectedUids).toEqual(state.selectedUids);
    expect(reloaded.selectedTiers).toEqual(selectedTiers);
    const synced=initializeFleet(reloaded).state;
    expect(synced.tiers.tier1).toEqual(state.tiers.tier1);expect(synced.tiers.tier2).toEqual(state.tiers.tier2);expect(synced.tiers.tier3).toEqual(state.tiers.tier3);
    expect(synced.selectedUids).toEqual(state.selectedUids);
    expect(await preferenceBackups()).toEqual(history);
  }
});
