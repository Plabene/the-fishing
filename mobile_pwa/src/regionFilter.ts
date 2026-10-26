import type {Boat} from './models';
import {el} from './dayView';
import {uniqueFleet} from './fleetList';
import {emptyRegion,matchesRegion,readRegionFilter,regionValue,regionValues,regionSelection,pruneRegionChildren,REGION_FIELDS,REGION_LABELS,UNKNOWN_REGION,type RegionFilter} from './regions';
export function renderRegionFilter(target:HTMLElement,boats:Boat[],selected:RegionFilter|undefined,onChange:(filter:RegionFilter)=>void) {
  const opened=new Set([...target.querySelectorAll<HTMLDetailsElement>('details[open]')].map(node=>node.dataset.regionField));
  const scroll=new Map([...target.querySelectorAll<HTMLElement>('.region-options')].map(node=>[node.id,node.scrollTop]));
  const focused=target.contains(document.activeElement)?document.activeElement as HTMLInputElement:null,focusField=focused?.dataset.regionChoice,focusValue=focused?.value,focusId=focused?.id;
  target.replaceChildren();boats=uniqueFleet(boats);const filter=readRegionFilter(selected),controls=el('div','','region-controls');
  for(const [index,key] of REGION_FIELDS.entries()) {
    const parent=Object.fromEntries(REGION_FIELDS.slice(0,index).map(k=>[k,filter[k]])),counts=new Map<string,number>();
    for(const boat of boats.filter(b=>matchesRegion(b,parent))) {const value=regionValue(boat,key);counts.set(value,(counts.get(value)||0)+1);}
    const chosen=regionValues(filter[key]);for(const value of chosen) if(!counts.has(value)) counts.set(value,0);
    const field=el('details','','region-field');field.dataset.regionField=key;field.open=opened.has(key);
    const summary=el('summary');summary.append(el('strong',REGION_LABELS[key]),el('span',chosen.length?chosen.map(v=>v===UNKNOWN_REGION?'미확인':v).join(', '):'전체'));summary.classList.toggle('has-selection',!!chosen.length);field.append(summary);
    const toolbar=el('div','','region-field-tools'),clear=el('button','전체');clear.type='button';clear.id=`region-${key}-all`;clear.className='region-all';clear.setAttribute('aria-label',`${REGION_LABELS[key]} 선택 초기화`);clear.addEventListener('click',()=>onChange(pruneRegionChildren(boats,{...filter,[key]:''},key)));toolbar.append(el('small','여러 곳 선택'),clear);field.append(toolbar);
    const options=el('fieldset','','region-options');options.id=`region-${key}`;options.append(el('legend',REGION_LABELS[key]+' 선택','sr-only'));
    for(const [value,count] of [...counts].sort(([a],[b])=>a===UNKNOWN_REGION ? 1:b===UNKNOWN_REGION ? -1:a.localeCompare(b,'ko'))) {
      const label=el('label','','region-choice'),input=el('input');input.type='checkbox';input.value=value;input.dataset.regionChoice=key;input.checked=chosen.includes(value);
      label.append(input,el('span',`${value===UNKNOWN_REGION?'미확인':value} (${count}척)`));
      input.addEventListener('change',()=>{const values=new Set(chosen);if(input.checked) values.add(value);else values.delete(value);onChange(pruneRegionChildren(boats,{...filter,[key]:regionSelection([...values])},key));});options.append(label);
    }
    if(!counts.size) options.append(el('p','선택 가능한 지역이 없습니다.','muted'));
    field.append(options);controls.append(field);
  }
  const reset=el('button','지역 초기화');reset.type='button';reset.id='region-reset';reset.setAttribute('aria-pressed',String(REGION_FIELDS.every(key=>!regionValues(filter[key]).length)));reset.addEventListener('click',()=>onChange(emptyRegion()));controls.append(reset);
  const help=el('details','','region-help');help.dataset.regionField='help';help.open=opened.has('help');help.append(el('summary','지역 선택 안내'),el('p','같은 항목은 하나라도 일치, 다른 항목은 모두 일치하는 선박을 표시합니다. 항구 선택 시 출항지 미확인 선박은 제외됩니다. 전국 완전 목록은 아직 확인되지 않았습니다.','muted'));
  target.append(controls,help);
  for(const node of target.querySelectorAll<HTMLElement>('.region-options')) node.scrollTop=scroll.get(node.id) || 0;
  [...target.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button')].find(node=>focusField?node.dataset.regionChoice===focusField && node.value===focusValue:!!focusId && node.id===focusId)?.focus({preventScroll:true});
}
