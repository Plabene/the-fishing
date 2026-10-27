import { el, sourceLink } from './dayView';
import { orderedBoats, tierFor } from './tierStore';
import { LABELS, TIERS, type AppState } from './models';
import { matchesRegion } from './regions';
import {matchesPlatform,boatPlatform,PLATFORM_LABELS} from './platforms';
import {bookingAlias} from './bookingAliases';
import {retainFocus} from './uiFocus';

export function renderSourceAccess(target: HTMLElement, state: AppState, selectedUid: string, selectBoat:(uid:string)=>void): void {
  const restoreFocus=retainFocus(target,()=>target.closest('details')?.querySelector('summary') || null);
  target.replaceChildren();
  const boats = orderedBoats(state).filter(boat=>state.selectedUids.includes(boat.uid) && matchesPlatform(boat,state.selectedPlatform) && matchesRegion(boat,state.selectedRegion));
  const chosen = boats.find(boat=>boat.uid===selectedUid) || boats[0];
  const heading = el('div');
  heading.append(el('h2','공식 사이트에서 현재 잔여석 확인'),el('p','API 조회가 실패하거나 외부 사이트 선박인 경우 공식 예약 페이지에서 현재 상황을 확인하세요.'));
  const controls = el('div','','source-access-controls');
  const label = el('label','공식 링크를 열 선박'), select = el('select'); select.id='source-boat';
  for (const tier of TIERS) {
    const group = el('optgroup'); group.label=LABELS[tier];
    for (const boat of boats.filter(boat=>tierFor(state,boat.uid)===tier)) {
      const option=el('option',`[${PLATFORM_LABELS[boatPlatform(boat)]}] ${boat.name}`); option.value=boat.uid; group.append(option);
    }
    if (group.children.length) select.append(group);
  }
  select.value=chosen?.uid || ''; select.disabled=!chosen;select.dataset.locked=String(!chosen);
  select.setAttribute('aria-describedby','source-access-reason');
  select.addEventListener('change',()=>selectBoat(select.value)); label.append(select); controls.append(label);
  const link = chosen && sourceLink(bookingAlias(chosen.uid)?.url || chosen.url,chosen.uid,chosen.name);
  if (link) { link.textContent='공식 예약 페이지 열기 ↗'; link.className='button primary'; controls.append(link); }
  const reason=el('p',chosen ? link?'공식 페이지는 새 탭에서 열립니다.':'저장된 공식 링크가 없습니다.':'등록된 티어와 지역을 확인하세요.','muted');reason.id='source-access-reason';controls.append(reason);
  target.append(heading,controls);
  restoreFocus();
}
