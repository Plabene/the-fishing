// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {defaultFleet} from '../src/defaultFleet';
import {matchesRegion,emptyRegion,commonRegion} from '../src/regions';
import {boatPlatform,duplicateCandidates} from '../src/platforms';
import {uniqueFleet,platformCounts} from '../src/fleetList';
import {saveState,loadState} from '../src/availabilityStore';
import {PUBLISHED_PREFERENCES_VERSION} from '../src/publishedPreferences';
import type {AppState} from '../src/models';

test('real Gunsan catalog includes both platforms under every Jeonbuk spelling; other coasts remain searchable',()=>{
  const boats=defaultFleet().boats;
  const sets=['전북','전라북도','전북특별자치도'].map(province=>boats.filter(b=>matchesRegion(b,{province,local:'군산시'})));
  expect(sets[0].map(b=>b.uid)).toEqual(sets[1].map(b=>b.uid));expect(sets[1].map(b=>b.uid)).toEqual(sets[2].map(b=>b.uid));
  expect(sets[0].filter(b=>boatPlatform(b)==='thefishing').length).toBeGreaterThan(0);expect(sets[0].filter(b=>boatPlatform(b)==='sunsang24').length).toBeGreaterThanOrEqual(78);
  for(const id of ['155','350','440','563','655','703','727','758','763','937','959','997','1033','1253','1394','1636','2021','2106','2110','2188','2311','2312','2533','2608']) expect(sets[0].some(b=>b.uid===`sunsang24:ship:${id}`)).toBe(true);
  expect(sets[0].some(b=>['sunsang24:ship:1338','sunsang24:ship:2109','sunsang24:ship:1796'].includes(b.uid))).toBe(false);
  for(const [province,local] of [['전북','부안군'],['경남','통영시'],['강원도','강릉시'],['경북','포항시'],['제주도','제주시']]) expect(boats.filter(b=>boatPlatform(b)==='sunsang24' && matchesRegion(b,{province,local})).length).toBeGreaterThan(0);
  expect(uniqueFleet(boats)).toHaveLength(boats.length);
  const a={uid:'1',name:'같은이름호',port:'비응항',url:'',region:{sea:'서해권',province:'전라북도',local:'군산시'}};
  const b={...a,uid:'sunsang24:ship:903',region:{...a.region,province:'전북',local:'군산'}};
  expect(commonRegion(a)).toEqual(commonRegion(b));expect(duplicateCandidates(a,[a,b,{...b,uid:'sunsang24:ship:904',port:'다른항'}])).toEqual([b]);expect(uniqueFleet([a,b])).toHaveLength(2);
});

test('Gunsan platform counts match visible rows; tier registration, selection, month change and backups preserve state without re-fetching',async()=>{
  const state=defaultFleet();state.publishedPreferencesVersion=PUBLISHED_PREFERENCES_VERSION;state.selectedRegion={...emptyRegion(),province:'전북',local:'군산'};await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();const request=vi.fn(()=>Promise.reject(new Error('Unexpected fetch')));vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'),{timeout:10000});await settle();
    const boats=state.boats.filter(b=>matchesRegion(b,state.selectedRegion)),counts=platformCounts(boats);
    expect(document.querySelectorAll('.boat-row')).toHaveLength(counts.all);expect(el('[data-platform="sunsang24"]').textContent).toBe('선상24 '+counts.sunsang24);
    el('[data-platform="sunsang24"]').click();await settle();expect(document.querySelectorAll('.boat-row')).toHaveLength(counts.sunsang24);
    const row=el('.boat-row[data-uid="sunsang24:ship:903"]'),select=row.querySelector('select')!;expect(select.value).toBe('');expect(select.selectedOptions[0].textContent).toBe('티어 미등록');
    select.value='tier2';select.dispatchEvent(new Event('change'));await settle();
    const saved=await loadState() as AppState;expect(saved.tiers.tier2).toContain('sunsang24:ship:903');expect(saved.selectedUids).toEqual(state.selectedUids);expect(row.querySelector('input')).toBeNull();
    const month=el('#month') as HTMLInputElement;month.value='2027-02';month.dispatchEvent(new Event('change'));await settle();expect(document.querySelectorAll('.boat-row')).toHaveLength(counts.sunsang24);
    el('[data-platform="thefishing"]').click();await settle();expect(document.querySelectorAll('.boat-row')).toHaveLength(counts.thefishing);expect(request).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();}
});
