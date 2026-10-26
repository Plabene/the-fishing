// @vitest-environment jsdom
import {expect,test} from 'vitest';
import {emptyState,type Boat} from '../src/models';
import {emptyRegion,matchesRegion,readRegion,regionLabel,UNKNOWN_REGION,type RegionFilter} from '../src/regions';
import {renderRegionFilter} from '../src/regionFilter';
import {queryMonth} from '../src/monthlyQuery';
import {importData,exportData} from '../src/importLegacy';
const boats:Boat[]=[
  {uid:'1',name:'서해호',port:'오천항',url:'',region:{sea:'서해권',province:'충청남도',local:'보령'}},
  {uid:'2',name:'남해호',port:'삼천포항',url:'',region:{sea:'남해권',province:'경상남도',local:'사천'}},
  {uid:'3',name:'미상호',port:'',url:''},
];
test('exact hierarchical filtering distinguishes unknown regions without inferring from names',()=>{
  expect(boats.filter(b=>matchesRegion(b,{sea:'서해권',port:'오천항'})).map(b=>b.uid)).toEqual(['1']);
  expect(boats.filter(b=>matchesRegion(b,{province:UNKNOWN_REGION})).map(b=>b.uid)).toEqual(['3']);
  expect(boats.filter(b=>matchesRegion(b,emptyRegion()))).toHaveLength(3);
  expect(regionLabel(boats[0])).toBe('서해권 · 충청남도 · 보령');expect(regionLabel(boats[2])).toBe('지역 미확인');expect(readRegion({sea:''})).toBeUndefined();
});
test('region controls show all boats, restrict descendants and reset dependent selections',()=>{
  const target=document.createElement('div');document.body.append(target);let selected:RegionFilter={...emptyRegion(),sea:'서해권',province:'충청남도',local:'보령',port:'오천항'};
  const render=()=>renderRegionFilter(target,boats,selected,next=>{selected=next;render();});render();
  const sea=target.querySelector('#region-sea')!;
  expect(sea.textContent).toContain('남해권 (1척)');expect(target.querySelector('#region-port')!.textContent).not.toContain('삼천포');
  sea.querySelector<HTMLInputElement>('input[value="남해권"]')!.click();
  target.querySelector<HTMLInputElement>('#region-sea input[value="서해권"]')!.click();expect(selected).toEqual({...emptyRegion(),sea:'남해권'});
  expect(target.querySelector('#region-local')!.textContent).toContain('사천');expect(target.querySelector('#region-local')!.textContent).not.toContain('보령');
  target.querySelector<HTMLButtonElement>('#region-reset')!.click();expect(selected).toEqual(emptyRegion());target.remove();
});
test('month results, species counts, missing boats and failures use the same region and survive month/backup changes',()=>{
  const state=emptyState();state.boats=boats;state.selectedUids=['1','2','3'];state.month='2026-10';state.selectedRegion={...emptyRegion(),sea:'서해권'};
  state.events=boats.slice(0,2).map((b,i)=>({id:b.uid,uid:b.uid,date:'2026-10-22',trip:i?'문어':'주꾸미',species:i?'문어':'주꾸미',remaining:2,port:b.port,departure:'05:00',verified:true,source:'imported',observedAt:'2026-10-01T00:00:00Z'}));
  state.failures=[{uid:'2',month:'2026-10',observedAt:null,status:'UNKNOWN',code:'error'}];
  const q={month:state.month,requiredPeople:1,tier:'all' as const,search:'',matchingOnly:true};
  const result=queryMonth(state,q);expect(result.boats.map(b=>b.uid)).toEqual(['1']);expect(result.events.map(b=>b.uid)).toEqual(['1']);expect(result.failures).toEqual([]);expect(result.missingBoats).toEqual([]);
  expect(result.speciesCounts.has('문어')).toBe(false);
  const november=queryMonth(state,{...q,month:'2026-11'});expect(november.events).toEqual([]);expect(november.missingBoats.map(b=>b.uid)).toEqual(['1']);
  expect(importData(JSON.parse(exportData(state))).state.selectedRegion).toEqual(state.selectedRegion);
  const pc=importData({entries:{one:{boat_uid:'1',boat_name:'이름',jurisdiction_label:'서해권',province_label:'충청남도',local_area_label:'태안'}}}).state;
  expect(pc.boats[0].region).toEqual({sea:'서해권',province:'충청남도',local:'태안'});
});
