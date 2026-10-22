import {expect,test} from 'vitest';
import {defaultFleet,initializeFleet,mergeFleetCatalog,FLEET_VERSION} from '../src/defaultFleet';
import {emptyState,type Boat} from '../src/models';
import {importData,exportData} from '../src/importLegacy';
import legacy from '../src/data/legacyFleet.json';
const boat=(uid:string,name=uid,port='오천항'):Boat=>({uid,name,port,url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:'충청남도',local:'보령'}});
test('published catalog merges metadata without changing selections, tiers, deleted boats, observations or custom fields',()=>{
  const baseline=[boat('1'),boat('2'),boat('3'),boat('4')],state=emptyState();
  state.boats=structuredClone(baseline.filter(b=>b.uid!=='4'));state.boats.push(boat('99','직접 추가'));
  state.boats[1].name='개인 별명';state.boats[1].port='개인 항구';state.boats[2].region!.local='개인 지역';
  state.selectedUids=['2'];state.tiers.tier2=['2','1'];state.selectedRegion={sea:'서해권',province:'',local:'',port:''};
  const before=structuredClone(state);
  const incoming=[boat('1','새 이름','새 항구'),boat('2','공개 이름','공개 항구'),boat('3'),boat('4'),boat('5')];incoming[2].region!.local='새 지역';
  const next=mergeFleetCatalog(state,incoming,'new-version',baseline);
  expect(next.boats.find(b=>b.uid==='1')).toMatchObject({name:'새 이름',port:'새 항구'});
  expect(next.boats.find(b=>b.uid==='2')).toMatchObject({name:'개인 별명',port:'개인 항구'});
  expect(next.boats.find(b=>b.uid==='3')?.region?.local).toBe('개인 지역');
  expect(next.boats.map(b=>b.uid)).toEqual(['1','2','3','99','5']);
  expect(next.selectedUids).toEqual(state.selectedUids);expect(next.tiers).toEqual(state.tiers);
  expect(next.selectedRegion).toEqual(state.selectedRegion);expect(next.events).toEqual(state.events);expect(state).toEqual(before);
  expect(mergeFleetCatalog(next,incoming,'new-version',next.fleetBaseline!)).toEqual(next);
  const removed={...next,boats:next.boats.filter(b=>b.uid!=='5')};
  expect(mergeFleetCatalog(removed,incoming,'next-version',removed.fleetBaseline!).boats.some(b=>b.uid==='5')).toBe(false);
});
test('first migration of the original PC catalog enriches regions and adds new boats but preserves personal deletion and tier ordering',()=>{
  const state=emptyState();state.fleetSeedVersion=legacy.version;state.boats=structuredClone(legacy.boats);
  const enriched=defaultFleet().boats.find(b=>b.region && state.boats.some(old=>old.uid===b.uid))!;
  const deleted=state.boats.find(b=>b.uid!==enriched.uid)!;state.boats=state.boats.filter(b=>b.uid!==deleted.uid);
  state.selectedUids=[enriched.uid];state.tiers.tier3=[enriched.uid];state.boats.find(b=>b.uid===enriched.uid)!.name='개인 이름';
  const result=initializeFleet(state);expect(result.changed).toBe(true);expect(result.state.fleetSeedVersion).toBe(FLEET_VERSION);
  expect(result.state.boats.find(b=>b.uid===enriched.uid)).toMatchObject({name:'개인 이름',region:enriched.region});
  expect(result.state.boats.some(b=>b.uid===deleted.uid)).toBe(false);expect(result.state.selectedUids).toEqual(state.selectedUids);expect(result.state.tiers).toEqual(state.tiers);
  const restored=importData(JSON.parse(exportData(result.state))).state;
  expect(restored.fleetBaseline).toEqual(result.state.fleetBaseline);expect(initializeFleet(restored).changed).toBe(false);
});
test('boats omitted by a later catalog stay in the personal list',()=>{
  const state=emptyState();state.boats=[boat('1'),boat('2')];
  expect(mergeFleetCatalog(state,[boat('1')],'new',state.boats).boats.map(b=>b.uid)).toEqual(['1','2']);
});
