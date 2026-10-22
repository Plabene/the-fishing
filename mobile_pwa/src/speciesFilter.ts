import { el } from './dayView';
import { speciesColor, speciesKey, speciesLabel, normalizeSpeciesSelection } from './species';

export function renderSpeciesFilter(target:HTMLElement,counts:Map<string,number>,selected:string|string[],excluded:string[],onChange:(selected:'all'|string[],excluded:string[])=>void,known:string[]=[]) {
  const focused=target.contains(document.activeElement) ? document.activeElement as HTMLElement:null;
  const focusedChoice=focused?.dataset.speciesChoice,focusedId=focused?.id;
  target.replaceChildren();
  const selection=normalizeSpeciesSelection(selected),blocked=new Set(excluded),keys=[...new Set([...counts.keys(),...known,...blocked,...(selection==='all' ? []:selection)])].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  const controls=el('div','','species-controls'),heading=el('strong','어종 선택 · 여러 개 선택 가능');
  const reset=el('button','전체 어종');reset.type='button';reset.id='species-all';reset.setAttribute('aria-pressed',String(selection==='all'));reset.addEventListener('click',()=>onChange('all',[]));
  const clear=el('button','선택 해제');clear.type='button';clear.id='species-none';clear.addEventListener('click',()=>onChange([],[]));
  controls.append(heading,reset,clear);target.append(controls);
  const status=el('p',selection==='all' ? '전체 어종을 표시합니다.':selection.length ? `선택: ${selection.map(speciesLabel).join(', ')}`:'선택한 어종이 없습니다. 아래에서 원하는 어종을 선택하세요.','species-selection-summary');status.id='species-selection-summary';status.setAttribute('role','status');target.append(status);
  const group=el('fieldset','','species-options');group.id='species-select';group.append(el('legend','조회할 어종 선택','sr-only'));
  const options=[...new Set(keys.flatMap(key=>[key,...key.split('+')]))].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  for(const key of options) {
    const label=el('label','','species-option'),checkbox=el('input');checkbox.type='checkbox';checkbox.value=key;checkbox.dataset.speciesChoice=key;checkbox.checked=selection!=='all' && selection.includes(key);
    label.style.backgroundColor=speciesColor(key);label.append(checkbox,el('span',speciesLabel(key)));
    checkbox.addEventListener('change',()=>{const next=new Set(selection==='all' ? []:selection);if(checkbox.checked) next.add(key);else next.delete(key);onChange([...next],[]);});group.append(label);
  }
  if(!options.length) group.append(el('p','조회 자료가 있으면 어종을 선택할 수 있습니다.','muted'));
  target.append(group,el('p','선택한 어종 중 하나라도 포함된 출조를 표시합니다. 전체 어종 상태에서 체크하면 선택한 어종만 표시하며, 추가 조회 없이 적용됩니다.','muted'));
  const details=el('details');details.id='species-panel';details.append(el('summary',`어종 포함·제외 · 제외 ${blocked.size}개`));
  const panels=el('div','','species-panels');
  for(const isExcluded of [false,true]) {
    const section=el('section');section.append(el('h3',isExcluded ? '제외 항목':'포함 항목'));
    const group=el('div','','species-chips');
    for(const key of keys.filter(key=>blocked.has(key)===isExcluded)) {
      const chip=el('button',`${speciesLabel(key)} · ${counts.get(key) || 0}건`,'species-chip');chip.type='button';chip.dataset.species=key;chip.style.backgroundColor=speciesColor(key);
      chip.setAttribute('aria-label',`${speciesLabel(key)} ${isExcluded ? '포함':'제외'}로 이동`);
      chip.addEventListener('click',()=>{const next=new Set(blocked);if(isExcluded) next.delete(key);else next.add(speciesKey(key));onChange(selection,[...next]);});group.append(chip);
    }
    if(!group.childElementCount) group.append(el('p',isExcluded ? '제외한 어종이 없습니다.':'해당 월의 포함 어종이 없습니다.','muted'));
    section.append(group);panels.append(section);
  }
  details.append(panels,el('p','항목을 누르면 포함·제외로 이동합니다. 다운샷·외수질 등 낚시 방법만 있고 어종이 없는 출조는 기타/미확인으로 표시하며, 원래 출조명은 상세·목록에서 확인할 수 있습니다.','muted'));target.append(details);
  // A save re-renders the panel; retain keyboard position for the next checkbox.
  const nextFocus=[...target.querySelectorAll<HTMLElement>('input,button')].find(node=>focusedChoice ? node.dataset.speciesChoice===focusedChoice : !!focusedId && node.id===focusedId);
  nextFocus?.focus({preventScroll:true});
}
