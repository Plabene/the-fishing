// @vitest-environment jsdom
import {expect,test} from 'vitest';
import {emptyState,type Boat,TIERS} from '../src/models';
import {matchesRegion,pruneRegionChildren,readRegionFilter,regionValues,type RegionFilter} from '../src/regions';
import {renderRegionFilter} from '../src/regionFilter';
import {selectBoats,moveBoat} from '../src/tierStore';
import {importData,exportData} from '../src/importLegacy';
import {renderCalendar} from '../src/calendarView';
import {renderDay} from '../src/dayView';
import {renderMonthlyList} from '../src/monthlyView';
import {queryMonth} from '../src/monthlyQuery';
import {appLayout} from '../src/appLayout';
import {defaultFleet} from '../src/defaultFleet';
import {catalogCoverage} from '../src/catalogCoverage';
import previous from '../src/data/previousTierRecovery.json';
import {RECOVERY_VERSION,initializePreferenceRecovery,suppliedPreferences} from '../src/preferenceRecovery';

const boats:Boat[]=[
  {uid:'1',name:'동명호',port:'여수항',url:'',region:{sea:'남해권',province:'전남',local:'여수'}},
  {uid:'2',name:'동명호',port:'녹동항',url:'',region:{sea:'남해권',province:'전라남도',local:'고흥'}},
  {uid:'3',name:'삼호',port:'삼천포항',url:'',region:{sea:'남해권',province:'경남',local:'사천'}},
  {uid:'4',name:'군산호',port:'비응항',url:'',region:{sea:'서해권',province:'전북',local:'군산'}},
];
test('region OR within fields and AND across fields preserve compatible children and backup arrays',()=>{
  const f=readRegionFilter({province:['전남','전라남도','경남'],local:['여수','고흥','사천'],port:['여수항','삼천포항']});
  expect(f.province).toEqual(['전라남도','경상남도']);
  expect(boats.filter(b=>matchesRegion(b,f)).map(b=>b.uid)).toEqual(['1','3']);
  const pruned=pruneRegionChildren(boats,{...f,province:'경상남도'},'province');
  expect(pruned.local).toBe('사천');expect(pruned.port).toBe('삼천포항');
  const expanded=pruneRegionChildren(boats,{...f,province:['전라남도','경상남도','전북특별자치도']},'province');
  expect(expanded.local).toEqual(f.local);expect(expanded.port).toEqual(f.port);
  const state={...emptyState(),boats,selectedRegion:f};expect(importData(JSON.parse(exportData(state))).state.selectedRegion).toEqual(f);
});
test('multi-region controls preserve multiple selections, reset a field, and keep valid descendants',()=>{
  const root=document.createElement('div');let selected:RegionFilter=readRegionFilter({province:['전남','경남'],local:['고흥','사천'],port:['녹동항','삼천포항']});
  const draw=()=>renderRegionFilter(root,boats,selected,next=>{selected=next;draw();});draw();
  const province=root.querySelector<HTMLSelectElement>('#region-province')!;expect(province.multiple).toBe(true);
  for(const option of province.options) option.selected=option.value==='경상남도';province.dispatchEvent(new Event('change'));
  expect(regionValues(selected.local)).toEqual(['사천']);expect(regionValues(selected.port)).toEqual(['삼천포항']);
  root.querySelector<HTMLButtonElement>('[aria-label="시·도/지역 선택 초기화"]')!.click();expect(selected.province).toBe('');expect(selected.local).toBe('사천');
  root.querySelector<HTMLButtonElement>('#region-reset')!.click();expect(Object.values(selected).every(v=>!v)).toBe(true);
});
test('selection assigns other once, preserves an existing tier, and unselect/reselect cannot erase assignments',()=>{
  const state={...emptyState(),boats};state.tiers.tier1=['1'];selectBoats(state,['1','2','2','absent'],true);
  expect(state.selectedUids).toEqual(['1','2']);expect(state.tiers.tier1).toEqual(['1']);expect(state.tiers.other).toEqual(['2']);
  moveBoat(state,'2','tier3');selectBoats(state,['1','2'],false);selectBoats(state,['2'],true);
  expect(state.tiers.tier3).toEqual(['2']);expect(state.tiers.other).toEqual([]);
  const restored=importData(JSON.parse(exportData(state))).state;expect(restored.tiers).toEqual(state.tiers);expect(restored.selectedUids).toEqual(['2']);
});
test('calendar, day and month agree on exact sets and preserve full source species and trip wording',()=>{
  const state={...emptyState(),boats,month:'2026-10',selectedUids:['1','2']};state.tiers.tier1=['1','2'];
  state.events=['주꾸미, 갑오징어 출조','광어 우럭 출조'].map((trip,i)=>({id:String(i),uid:String(i+1),date:'2026-10-27',trip,port:boats[i].port,departure:'05:00',remaining:6,verified:true,source:'api',observedAt:new Date().toISOString()}));
  const original=JSON.stringify(state.events);
  for(const [selected,label,count] of [[['갑오징어'],'',0],[['주꾸미'],'',0],[['갑오징어','주꾸미'],'쭈꾸미ㆍ갑오징어',1],[['우럭'],'',0],[['광어','우럭'],'광어·우럭',1],[['갑오징어','우럭'],'',0]] as const) {
    state.selectedSpecies=[...selected];const result=queryMonth(state,{month:state.month,tier:'all',requiredPeople:1,search:'',matchingOnly:true});expect(result.events).toHaveLength(count);
    const cal=document.createElement('div'),day=document.createElement('div'),month=document.createElement('div');
    renderCalendar(cal,state,'all','','2026-10-27',()=>{},true,result);renderDay(day,state,'2026-10-27','all','',true,result);renderMonthlyList(month,state,result,50,()=>{},()=>{});
    expect(cal.querySelector('.calendar-boat-species')?.textContent).toBe(count?label:undefined);
    for(const target of [day,month]) {expect(target.querySelector('.species-badge')?.textContent).toBe(count?`어종 · ${label}`:undefined);if(count) expect(target.textContent).toContain(result.events[0].trip);}
  }
  expect(JSON.stringify(state.events)).toBe(original);
});
test('region panel precedes calendar and boat selection/management follows calendar',()=>{
  const root=document.createElement('div');root.innerHTML=appLayout(21);
  const before=(a:string,b:string)=>!!(root.querySelector(a)!.compareDocumentPosition(root.querySelector(b)!)&Node.DOCUMENT_POSITION_FOLLOWING);
  expect(before('#search-section','#calendar-layout')).toBe(true);expect(before('#calendar-layout','#fleet-section')).toBe(true);expect(before('#fleet-section','.fleet-management')).toBe(true);
});
test('latest backup upgrades only the unchanged old backup; later edits and intentional empty preferences survive',()=>{
  const base={...defaultFleet(),tiers:structuredClone(previous.tiers),selectedUids:[...previous.selectedUids],preferenceRecoveryVersion:previous.version};
  const upgraded=initializePreferenceRecovery(base,true);expect(upgraded.state.tiers).toEqual(suppliedPreferences.tiers);expect(upgraded.state.selectedUids).toEqual(suppliedPreferences.selectedUids);
  const personal=structuredClone(base);moveBoat(personal,previous.tiers.tier1[0],'tier3');
  expect(initializePreferenceRecovery(personal,true).state.tiers).toEqual(personal.tiers);
  for(const t of TIERS) personal.tiers[t]=[];
  const empty=initializePreferenceRecovery(personal,true);expect(empty.restored).toBe(0);expect(empty.state.preferenceRecoveryVersion).toBe(RECOVERY_VERSION);
});
test('national counts equal actual unique listings and aliases do not omit Jeonnam or Gunsan',()=>{
  const state=defaultFleet(),rows=catalogCoverage(state.boats,readRegionFilter({province:['전남','전북']}));
  expect(rows.reduce((n,r)=>n+r.stored,0)).toBe(state.boats.length);
  for(const row of rows) {expect(row.publicItems).toBeGreaterThanOrEqual(row.publicUnique);expect(row.sourceSearchTotal).toBeNull();expect(row.sunsang24).toBe(state.boats.filter(b=>b.uid.startsWith('sunsang24:') && matchesRegion(b,{province:row.province==='미확인'?'__unknown__':row.province})).length + state.boats.filter(b=>b.uid.startsWith('external:') && b.url.includes('sunsang24') && matchesRegion(b,{province:row.province==='미확인'?'__unknown__':row.province})).length);}
  expect(rows.find(r=>r.province==='전라남도')?.sunsang24).toBeGreaterThanOrEqual(70);
  expect(state.boats.filter(b=>matchesRegion(b,{province:'전라북도',local:'군산'})).length).toBeGreaterThanOrEqual(86);
});
