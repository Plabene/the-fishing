import type {Boat} from './models';
import {el} from './dayView';
import {emptyRegion,matchesRegion,readRegionFilter,regionValue,REGION_FIELDS,REGION_LABELS,UNKNOWN_REGION,type RegionFilter} from './regions';
export function renderRegionFilter(target:HTMLElement,boats:Boat[],selected:RegionFilter|undefined,onChange:(filter:RegionFilter)=>void) {
  target.replaceChildren();const filter=readRegionFilter(selected),controls=el('div','','region-controls');
  for(const [index,key] of REGION_FIELDS.entries()) {
    const parent=Object.fromEntries(REGION_FIELDS.slice(0,index).map(k=>[k,filter[k]])),counts=new Map<string,number>();
    for(const boat of boats.filter(b=>matchesRegion(b,parent))) {const value=regionValue(boat,key);counts.set(value,(counts.get(value)||0)+1);}
    if(filter[key] && !counts.has(filter[key])) counts.set(filter[key],0);
    const label=el('label',REGION_LABELS[key]),select=el('select');select.id=`region-${key}`;
    const all=el('option',`전체 ${REGION_LABELS[key]}`);all.value='';select.append(all);
    for(const [value,count] of [...counts].sort(([a],[b])=>a===UNKNOWN_REGION ? 1:b===UNKNOWN_REGION ? -1:a.localeCompare(b,'ko'))) {const option=el('option',`${value===UNKNOWN_REGION ? '미확인':value} (${count}척)`);option.value=value;select.append(option);}
    select.value=filter[key];select.addEventListener('change',()=>{const next={...filter,[key]:select.value};for(const child of REGION_FIELDS.slice(index+1)) next[child]='';onChange(next);});label.append(select);controls.append(label);
  }
  const reset=el('button','전체 지역');reset.type='button';reset.id='region-reset';reset.addEventListener('click',()=>onChange(emptyRegion()));controls.append(reset);
  target.append(controls,el('p','PC·더피싱 사이트의 지역 분류를 따릅니다. 선택한 지역은 달력 조회와 내 선박 목록에 함께 적용됩니다.','muted'));
}
