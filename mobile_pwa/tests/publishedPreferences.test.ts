import {expect,test} from 'vitest';
import 'fake-indexeddb/auto';
import {defaultFleet} from '../src/defaultFleet';
import {applyPublishedPreferences,PUBLISHED_PREFERENCES_VERSION} from '../src/publishedPreferences';
import {backupPreferences,previousPreferences} from '../src/availabilityStore';
import {importData,exportData} from '../src/importLegacy';
import seed from '../src/data/publishedPreferences.json';
test('published backup applies exact tier order and selection without changing vessel attributes or injecting reservations',()=>{
  const before=defaultFleet(),after=applyPublishedPreferences(before,true);
  expect(after.tiers).toEqual(seed.tiers);expect(after.selectedUids).toEqual(seed.selectedUids);
  expect(Object.values(after.tiers).map(ids=>ids.length)).toEqual([15,18,28,52]);expect(after.selectedUids).toHaveLength(118);
  expect(after.boats).toEqual(before.boats);expect(after.events).toEqual(before.events);
  expect(new Set(seed.boatUids).size).toBe(1057);
  expect(Object.keys(seed).sort()).toEqual(['boatUids','selectedUids','tiers','version']);
});
test('migration is one-time, persists through backup and keeps custom vessels and deleted vessel choices',()=>{
  const before=defaultFleet(),deleted=seed.tiers.tier1[0];before.boats=before.boats.filter(b=>b.uid!==deleted);
  before.boats.push({uid:'custom',name:'내 선박',port:'내 항구',url:''});before.tiers.tier2.push('custom');before.selectedUids.push('custom');
  const after=applyPublishedPreferences(before,true);expect(after.tiers.tier1).not.toContain(deleted);expect(after.selectedUids).not.toContain(deleted);
  expect(after.tiers.tier2.at(-1)).toBe('custom');expect(after.selectedUids.at(-1)).toBe('custom');
  after.tiers.tier1.reverse();after.selectedUids=[];
  expect(applyPublishedPreferences(after)).toBe(after);
  const restored=importData(JSON.parse(exportData(after))).state;
  expect(restored.publishedPreferencesVersion).toBe(PUBLISHED_PREFERENCES_VERSION);expect(applyPublishedPreferences(restored)).toBe(restored);
});
test('pre-migration preference backup round-trips separately from current observations',async()=>{
  const before=defaultFleet();await backupPreferences(before,PUBLISHED_PREFERENCES_VERSION);
  expect(await previousPreferences(PUBLISHED_PREFERENCES_VERSION)).toEqual({tiers:before.tiers,selectedUids:before.selectedUids});
  expect(await previousPreferences('nonexistent')).toBeUndefined();
});
