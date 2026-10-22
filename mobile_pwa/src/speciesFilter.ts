import { el } from './dayView';
import { speciesColor, speciesKey, speciesLabel } from './species';

export function renderSpeciesFilter(target:HTMLElement,counts:Map<string,number>,selected:string,excluded:string[],onChange:(selected:string,excluded:string[])=>void,known:string[]=[]) {
  target.replaceChildren();
  const blocked=new Set(excluded),keys=[...new Set([...counts.keys(),...known,...blocked,...(selected==='all' ? []:[selected])])].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  const controls=el('div','','species-controls'),label=el('label','어종 선택'),select=el('select');select.id='species-select';
  const all=el('option','전체 어종');all.value='all';select.append(all);
  const options=[...new Set(keys.flatMap(key=>[key,...key.split('+')]))].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  for(const key of options) {const option=el('option',speciesLabel(key));option.value=key;select.append(option);}
  select.value=selected;select.addEventListener('change',()=>onChange(select.value,[]));label.append(select);
  const reset=el('button','모두 포함');reset.type='button';reset.id='species-all';reset.addEventListener('click',()=>onChange('all',[]));
  controls.append(label,reset);target.append(controls,el('p','복합 출조는 포함된 어종으로도 찾을 수 있습니다. 필터 변경은 추가 조회 없이 결과에 적용합니다.','muted'));
  const details=el('details');details.id='species-panel';details.append(el('summary',`어종 포함·제외 · 제외 ${blocked.size}개`));
  const panels=el('div','','species-panels');
  for(const isExcluded of [false,true]) {
    const section=el('section');section.append(el('h3',isExcluded ? '제외 항목':'포함 항목'));
    const group=el('div','','species-chips');
    for(const key of keys.filter(key=>blocked.has(key)===isExcluded)) {
      const chip=el('button',`${speciesLabel(key)} · ${counts.get(key) || 0}건`,'species-chip');chip.type='button';chip.dataset.species=key;chip.style.backgroundColor=speciesColor(key);
      chip.setAttribute('aria-label',`${speciesLabel(key)} ${isExcluded ? '포함':'제외'}로 이동`);
      chip.addEventListener('click',()=>{const next=new Set(blocked);if(isExcluded) next.delete(key);else next.add(speciesKey(key));onChange(selected,[...next]);});group.append(chip);
    }
    if(!group.childElementCount) group.append(el('p',isExcluded ? '제외한 어종이 없습니다.':'해당 월의 포함 어종이 없습니다.','muted'));
    section.append(group);panels.append(section);
  }
  details.append(panels,el('p','항목을 누르면 포함·제외로 이동합니다. 출조명·어종을 확인할 수 없는 결과는 기타/미확인으로 표시합니다.','muted'));target.append(details);
}
