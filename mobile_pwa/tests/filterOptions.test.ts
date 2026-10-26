// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {emptyState,type SpeciesSelection,TIERS} from '../src/models';
import {speciesOptions,matchesSpecies} from '../src/species';
import {renderSpeciesFilter} from '../src/speciesFilter';
import {queryMonth} from '../src/monthlyQuery';
import {importData,exportData} from '../src/importLegacy';
import {readTierFilter,matchesTier} from '../src/tierStore';
import {appLayout} from '../src/appLayout';
import {finishFilterPanels,installFilterPanels} from '../src/filterPanels';
import {renderRegionFilter} from '../src/regionFilter';
import {emptyRegion} from '../src/regions';
import captured from './fixtures/species-real-20261026.json';

afterEach(()=>document.body.replaceChildren());

test('captured flower combination is an independent option beside both singles; old exact-set selections migrate safely',()=>{
  const root=document.createElement('div');document.body.append(root);
  let selected:SpeciesSelection=['쭈꾸미','갑오징어'];const counts=new Map([[captured.events[0].speciesKey,1],['갑오징어',2],['광어+우럭',3]]);
  const draw=()=>renderSpeciesFilter(root,counts,selected,[],value=>{selected=value;draw();});draw();
  const check=(key:string)=>root.querySelector<HTMLInputElement>(`[data-species-choice="${key}"]`)!;
  expect(check('주꾸미+갑오징어').checked).toBe(true);expect(check('갑오징어').checked).toBe(false);expect(check('주꾸미').checked).toBe(false);
  expect(check('주꾸미+갑오징어').parentElement?.textContent).toBe('쭈꾸미ㆍ갑오징어복합 1건');
  expect(check('주꾸미').parentElement?.textContent).toBe('주꾸미단독 0건');expect(check('광어+우럭')).not.toBeNull();
  check('갑오징어').click();expect(selected).toEqual({mode:'options',keys:['주꾸미+갑오징어','갑오징어']});
  expect(matchesSpecies('주꾸미,갑오징어',selected)).toBe(true);expect(matchesSpecies('갑오징어',selected)).toBe(true);expect(matchesSpecies('주꾸미',selected)).toBe(false);
  check('주꾸미+갑오징어').click();expect(matchesSpecies(captured.events[0].trip,selected)).toBe(false);
  check('주꾸미').click();expect(matchesSpecies(captured.events[0].trip,selected)).toBe(false); // two singles never silently mean the mixed option
  expect(root.querySelector('#species-selection-summary')?.textContent).toContain('정확히 일치 2건');
});

test('option aliases and spaces deduplicate whole sets and preserve meaning in backup and repeated reads',()=>{
  const selection={mode:'options' as const,keys:[' 갑오징어, 쭈꾸미 ','주꾸미+갑오징어','갑오징어','광어, 우럭','우럭/광어']};
  expect(speciesOptions(selection)).toEqual(['주꾸미+갑오징어','갑오징어','광어+우럭']);
  const s=emptyState();s.selectedSpecies=selection;s.selectedTiers=['tier1','tier2'];
  const restored=importData(JSON.parse(exportData(s))).state;
  expect(restored.selectedSpecies).toEqual({mode:'options',keys:['주꾸미+갑오징어','갑오징어','광어+우럭']});expect(restored.selectedTiers).toEqual(s.selectedTiers);
  expect(importData(JSON.parse(exportData(restored))).state.selectedSpecies).toEqual(restored.selectedSpecies);
  expect(speciesOptions(['주꾸미','갑오징어'])).toEqual(['주꾸미+갑오징어']);
  for(const selection of ['all',[],{mode:'options',keys:[]}]) {s.selectedSpecies=selection as SpeciesSelection;expect(importData(JSON.parse(exportData(s))).state.selectedSpecies).toEqual(selection);}
});

test('multiple tiers combine with region, exact species options, date, seats and selected vessels without changing assignments',()=>{
  const s=emptyState();s.month='2026-11';
  s.boats=TIERS.map((tier,i)=>({uid:String(i+1),name:tier,port:'오천항',url:'',region:{sea:'서해권',province:'충남',local:i===2?'서천':'보령'}}));s.selectedUids=s.boats.map(b=>b.uid);
  TIERS.forEach((tier,i)=>s.tiers[tier]=[String(i+1)]);
  s.events=s.boats.map((b,i)=>({id:String(i),uid:b.uid,date:'2026-11-06',trip:i%2?'갑오징어':'주꾸미,갑오징어',remaining:4,verified:true,observedAt:new Date().toISOString(),source:'api',port:b.port,departure:'05:00'}));
  const before=JSON.stringify(s),q={month:s.month,tier:['tier1','tier2'] as typeof TIERS[number][],search:'',requiredPeople:1,matchingOnly:true};
  expect(queryMonth(s,q).events.map(e=>e.uid)).toEqual(['1','2']);
  expect(queryMonth(s,{...q,species:{mode:'options',keys:['주꾸미+갑오징어']}}).events.map(e=>e.uid)).toEqual(['1']);
  expect(queryMonth(s,{...q,tier:[...TIERS]}).events).toHaveLength(4);expect(queryMonth(s,{...q,tier:[]}).events).toHaveLength(0);
  expect(queryMonth(s,{...q,month:'2026-12'}).events).toHaveLength(0);expect(queryMonth(s,{...q,requiredPeople:5}).events).toHaveLength(0);
  expect(JSON.stringify(s)).toBe(before);
  s.selectedRegion={...emptyRegion(),local:'보령'};expect(queryMonth(s,{...q,tier:[...TIERS]}).events).toHaveLength(3);
  s.selectedUids=['1'];expect(queryMonth(s,q).events).toHaveLength(1);
  expect(readTierFilter(['tier1','tier1','bogus','other'])).toEqual(['tier1','other']);expect(matchesTier('other',[])).toBe(false);
});

test('manual close, reopen and completion keep form values; errors and cancellation do not silently collapse filters',()=>{
  const root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);installFilterPanels(root);
  const ids=['region-toggle','species-toggle'],panel=(id:string)=>root.querySelector<HTMLDetailsElement>('#'+id)!;
  const input=root.querySelector<HTMLInputElement>('#people')!;input.value='3';
  for(const id of ids) {panel(id).open=true;root.querySelector<HTMLButtonElement>(`[data-close-panel="${id}"]`)!.click();expect(panel(id).open).toBe(false);expect(input.value).toBe('3');panel(id).querySelector<HTMLElement>('summary')!.click();expect(panel(id).open).toBe(true);}
  for(const outcome of ['loading','cancelled','partial','error'] as const) {finishFilterPanels(root,outcome);expect(ids.every(id=>panel(id).open)).toBe(true);}
  for(const outcome of ['success','empty'] as const) {ids.forEach(id=>panel(id).open=true);finishFilterPanels(root,outcome);expect(ids.some(id=>panel(id).open)).toBe(false);expect(input.value).toBe('3');}
  finishFilterPanels(root,'error');expect(panel('region-toggle').open).toBe(true);
  const before=(a:string,b:string)=>!!(root.querySelector(a)!.compareDocumentPosition(root.querySelector(b)!)&Node.DOCUMENT_POSITION_FOLLOWING);
  expect(before('#calendar-layout','#fleet-section')).toBe(true);expect(root.querySelector('#selected-boats')).toBeNull();
  expect(before('#region-toggle','#calendar-layout')).toBe(true);expect(before('#species-toggle','#calendar-layout')).toBe(true);
  expect(root.querySelector('.calendar-filter-row a[href="#fleet-section"]')).toBeNull();
});

test('region checkboxes preserve open fields, scroll and focus while keeping valid selections across parents',()=>{
  const root=document.createElement('div');document.body.append(root);let selected=emptyRegion();
  const boats=[{uid:'1',name:'여수호',port:'여수항',url:'',region:{sea:'남해권',province:'전남',local:'여수'}},{uid:'2',name:'사천호',port:'삼천포항',url:'',region:{sea:'남해권',province:'경남',local:'사천'}}];
  const draw=()=>renderRegionFilter(root,boats,selected,value=>{selected=value;draw();});draw();
  root.querySelector<HTMLDetailsElement>('[data-region-field="province"]')!.open=true;
  root.querySelector<HTMLElement>('#region-province')!.scrollTop=30;
  root.querySelector<HTMLInputElement>('#region-province input[value="전라남도"]')!.click();
  const input=root.querySelector<HTMLInputElement>('#region-province input[value="경상남도"]')!;input.focus();input.click();
  expect(selected.province).toEqual(['전라남도','경상남도']);expect(root.querySelector<HTMLDetailsElement>('[data-region-field="province"]')!.open).toBe(true);
  expect(root.querySelector('#region-province')!.scrollTop).toBe(30);expect((document.activeElement as HTMLInputElement).value).toBe('경상남도');
  root.querySelector<HTMLInputElement>('#region-local input[value="사천"]')!.click();
  root.querySelector<HTMLInputElement>('#region-province input[value="전라남도"]')!.click();expect(selected.local).toBe('사천');
});
