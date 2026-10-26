import { el } from './dayView';
import { speciesColor, speciesKey, speciesLabel, normalizeSpeciesSelection, matchesSpecies } from './species';

export function renderSpeciesFilter(target:HTMLElement,counts:Map<string,number>,selected:string|string[],excluded:string[],onChange:(selected:'all'|string[],excluded:string[])=>void,disabledReason='',matchingCounts=counts) {
  const focused=target.contains(document.activeElement) ? document.activeElement as HTMLElement:null;
  const focusedChoice=focused?.dataset.speciesChoice,focusedId=focused?.id;
  target.replaceChildren();
  const selection=normalizeSpeciesSelection(selected),blocked=new Set(excluded),keys=[...counts.keys()].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  const controls=el('div','','species-controls'),heading=el('strong','어종 선택 · 정확히 일치');
  const reset=el('button','전체 어종');reset.type='button';reset.id='species-all';reset.setAttribute('aria-pressed',String(selection==='all'));reset.addEventListener('click',()=>onChange('all',[]));
  const clear=el('button','선택 해제');clear.type='button';clear.id='species-none';clear.addEventListener('click',()=>onChange([],[]));
  controls.append(heading,reset,clear);target.append(controls);
  const matched=[...matchingCounts].reduce((total,[key,count])=>total+(!blocked.has(key) && matchesSpecies(key,selection)?count:0),0);
  const status=el('p',disabledReason || (selection==='all' ? '전체 어종 표시 · 1개 선택은 단독 출조, 여러 개 선택은 같은 어종 조합만 표시합니다.':selection.length ? `선택: ${selection.map(speciesLabel).join(', ')} · 같은 어종 조합 ${matched}건`:'선택한 어종이 없습니다. 아래에서 원하는 어종을 선택하세요.'),'species-selection-summary');status.id='species-selection-summary';status.setAttribute('role','status');target.append(status);
  const group=el('fieldset','','species-options');group.id='species-select';group.append(el('legend','조회할 어종 선택','sr-only'));
  const options=[...new Set(keys.flatMap(key=>key.split('+')))].sort((a,b)=>speciesLabel(a).localeCompare(speciesLabel(b),'ko'));
  for(const key of options) {
    const label=el('label','','species-option'),checkbox=el('input');checkbox.type='checkbox';checkbox.value=key;checkbox.dataset.speciesChoice=key;checkbox.checked=selection!=='all' && selection.includes(key);
    label.style.backgroundColor=speciesColor(key);
    const count=blocked.has(key)?0:matchingCounts.get(key) || 0;
    label.append(checkbox,el('span',speciesLabel(key)),el('small',`${key==='unknown'?'미확인':'단독'} ${count}건`));
    checkbox.addEventListener('change',()=>{const next=new Set(selection==='all' ? []:selection);if(checkbox.checked) next.add(key);else next.delete(key);onChange([...next],[]);});group.append(label);
  }
  if(!options.length) group.append(el('p','조회 자료가 있으면 어종을 선택할 수 있습니다.','muted'));
  target.append(group);
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
  details.hidden=!keys.length;
  target.dataset.state=disabledReason?'disabled':'ready';
  for(const control of target.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button')) {control.disabled=!!disabledReason;control.dataset.locked=String(!!disabledReason);control.setAttribute('aria-describedby','species-selection-summary');}
  // A save re-renders the panel; retain keyboard position for the next checkbox.
  const nextFocus=[...target.querySelectorAll<HTMLElement>('input,button')].find(node=>focusedChoice ? node.dataset.speciesChoice===focusedChoice : !!focusedId && node.id===focusedId);
  nextFocus?.focus({preventScroll:true});
}
