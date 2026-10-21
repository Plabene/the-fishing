import { el, sourceLink } from './dayView';
import { orderedBoats, tierFor } from './tierStore';
import { LABELS, TIERS, type AppState } from './models';

export function renderSourceAccess(target: HTMLElement, state: AppState, selectedUid: string, selectBoat:(uid:string)=>void): void {
  target.replaceChildren();
  const boats = orderedBoats(state).filter(boat=>state.selectedUids.includes(boat.uid));
  const chosen = boats.find(boat=>boat.uid===selectedUid) || boats[0];
  const heading = el('div');
  heading.append(el('h2','현재 예약 상황 확인'),el('p','실시간 연동 대기 · 앱 안의 달력은 가져온 기록을 표시합니다. 현재 잔여석은 선박의 공식 페이지에서 확인하세요.'));
  const controls = el('div','','source-access-controls');
  const label = el('label','선박 선택'), select = el('select'); select.id='source-boat';
  for (const tier of TIERS) {
    const group = el('optgroup'); group.label=LABELS[tier];
    for (const boat of boats.filter(boat=>tierFor(state,boat.uid)===tier)) {
      const option=el('option',boat.name); option.value=boat.uid; group.append(option);
    }
    if (group.children.length) select.append(group);
  }
  select.value=chosen?.uid || ''; select.disabled=!chosen;
  select.addEventListener('change',()=>selectBoat(select.value)); label.append(select); controls.append(label);
  const link = chosen && sourceLink(chosen.url,chosen.uid);
  if (link) { link.textContent='공식 예약 페이지 열기 ↗'; link.className='button primary'; controls.append(link); }
  else controls.append(el('p',chosen ? '저장된 공식 링크가 없습니다.' : '내 선박 관리에서 확인할 선박을 선택하세요.','muted'));
  target.append(heading,controls);
}
