import type {Boat} from './models';
import {el} from './dayView';
import {uniqueFleet} from './fleetList';
import {emptyRegion,matchesRegion,readRegionFilter,regionValue,regionValues,regionSelection,pruneRegionChildren,REGION_FIELDS,REGION_LABELS,UNKNOWN_REGION,type RegionFilter} from './regions';
export function renderRegionFilter(target:HTMLElement,boats:Boat[],selected:RegionFilter|undefined,onChange:(filter:RegionFilter)=>void) {
  target.replaceChildren();boats=uniqueFleet(boats);const filter=readRegionFilter(selected),controls=el('div','','region-controls');
  for(const [index,key] of REGION_FIELDS.entries()) {
    const parent=Object.fromEntries(REGION_FIELDS.slice(0,index).map(k=>[k,filter[k]])),counts=new Map<string,number>();
    for(const boat of boats.filter(b=>matchesRegion(b,parent))) {const value=regionValue(boat,key);counts.set(value,(counts.get(value)||0)+1);}
    const chosen=regionValues(filter[key]);for(const value of chosen) if(!counts.has(value)) counts.set(value,0);
    const label=el('label',REGION_LABELS[key]),select=el('select');select.id=`region-${key}`;
    const all=el('option',`전체 ${REGION_LABELS[key]}`);all.value='';select.append(all);
    for(const [value,count] of [...counts].sort(([a],[b])=>a===UNKNOWN_REGION ? 1:b===UNKNOWN_REGION ? -1:a.localeCompare(b,'ko'))) {const option=el('option',`${value===UNKNOWN_REGION ? '미확인':value} (${count}척)`);option.value=value;select.append(option);}
    select.multiple=true;select.size=4;
    for(const option of select.options) option.selected=chosen.length?chosen.includes(option.value):!option.value;
    select.classList.toggle('has-selection',!!chosen.length);select.setAttribute('aria-label',`${REGION_LABELS[key]} · 여러 곳 선택`);
    select.addEventListener('change',()=>{
      let values=[...select.selectedOptions].map(o=>o.value);
      if(values.includes('')) values=chosen.length?[]:values.filter(Boolean);
      onChange(pruneRegionChildren(boats,{...filter,[key]:regionSelection(values)},key));
    });
    const clear=el('button',`전체 ${REGION_LABELS[key]}`);clear.type='button';clear.className='region-all';clear.setAttribute('aria-label',`${REGION_LABELS[key]} 선택 초기화`);clear.addEventListener('click',()=>onChange(pruneRegionChildren(boats,{...filter,[key]:''},key)));
    label.append(select,clear);controls.append(label);
  }
  const reset=el('button','전체 조건 초기화');reset.type='button';reset.id='region-reset';reset.setAttribute('aria-pressed',String(REGION_FIELDS.every(key=>!regionValues(filter[key]).length)));reset.addEventListener('click',()=>onChange(emptyRegion()));controls.append(reset);
  target.append(controls,el('p','각 항목에서 여러 곳을 선택할 수 있습니다(PC: Ctrl/⌘+클릭). 같은 항목은 하나라도 일치, 다른 항목은 모두 일치하는 선박을 표시합니다. 항구 선택 시 출항지 미확인 선박은 제외됩니다. 전국 완전 목록은 아직 확인되지 않았습니다.','muted'));
}
