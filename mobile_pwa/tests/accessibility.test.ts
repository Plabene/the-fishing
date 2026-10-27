// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {retainFocus,canFocus} from '../src/uiFocus';
import {LiveStatus} from '../src/liveStatus';
import {renderRegionFilter} from '../src/regionFilter';
import {renderSpeciesFilter} from '../src/speciesFilter';
import {renderDay} from '../src/dayView';
import {renderMonthlyList} from '../src/monthlyView';
import {queryMonth} from '../src/monthlyQuery';
import {emptyState} from '../src/models';
import {installFilterPanels} from '../src/filterPanels';

afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();});
function mount() {const root=document.createElement('main');document.body.append(root);return root;}
test('temporary disabling/node replacement restores logical focus but never overrides another user destination',()=>{
  const root=mount();root.innerHTML='<button data-tier="tier1">1티어</button><button id="other">다른 작업</button>';
  const original=root.querySelector<HTMLButtonElement>('[data-tier]')!;original.focus();const restore=retainFocus(root);original.disabled=true;original.blur();
  original.replaceWith(Object.assign(document.createElement('button'),{textContent:'새 1티어'}));root.querySelector('button')!.dataset.tier='tier1';restore();expect(document.activeElement).toBe(root.querySelector('button'));
  const again=retainFocus(root);root.querySelector<HTMLButtonElement>('#other')!.focus();again();expect(document.activeElement?.id).toBe('other');
});
test('hidden, closed, inert and disabled destinations never receive restored focus',()=>{
  const root=mount();root.innerHTML='<details open><summary>메뉴</summary><button id="inside">설정</button></details><button id="fallback">복귀</button>';
  const input=root.querySelector<HTMLButtonElement>('#inside')!,details=root.querySelector('details')!;input.focus();const restore=retainFocus(root,()=>root.querySelector('#fallback'));details.open=false;input.blur();restore();expect(document.activeElement?.id).toBe('fallback');expect(canFocus(input)).toBe(false);expect(canFocus(details.querySelector('summary'))).toBe(true);
  details.open=true;input.disabled=true;expect(canFocus(input)).toBe(false);input.disabled=false;details.hidden=true;expect(canFocus(input)).toBe(false);details.hidden=false;details.setAttribute('inert','');expect(canFocus(input)).toBe(false);
});
test('one status channel coalesces progress to at most once per 1.5 seconds and final/error cancels queued progress',()=>{
  vi.useFakeTimers();const node=mount(),status=new LiveStatus(node,()=>Date.now());status.say('조회 시작');
  for(let i=1;i<=20;i++) {status.progress(`${i}척 확인`);vi.advanceTimersByTime(50);}
  expect(node.textContent).toBe('조회 시작');vi.advanceTimersByTime(500);expect(node.textContent).toBe('20척 확인');
  status.progress('21척 확인');status.say('조회 실패 · 1척 미확인');vi.advanceTimersByTime(3000);expect(node.textContent).toBe('조회 실패 · 1척 미확인');
});
test('region summary, exact-species checkbox and include/exclude chip keep focus through rerender and Escape closes only the nearest disclosure',()=>{
  const root=mount();root.innerHTML='<details id="outer" open><summary>지역</summary><section id="regions"></section></details><details id="species" open><summary>어종</summary><section id="choices"></section></details>';installFilterPanels(root);
  const region=root.querySelector<HTMLElement>('#regions')!,species=root.querySelector<HTMLElement>('#choices')!,boats=[{uid:'1',name:'시험',port:'비응항',url:'',region:{sea:'서해권',province:'전북특별자치도',local:'군산'}}];
  renderRegionFilter(region,boats,undefined,vi.fn());const field=region.querySelector<HTMLDetailsElement>('[data-region-field="province"]')!;field.open=true;field.querySelector<HTMLElement>('summary')!.focus();renderRegionFilter(region,boats,undefined,vi.fn());expect(document.activeElement?.parentElement?.getAttribute('data-region-field')).toBe('province');expect(region.querySelector<HTMLDetailsElement>('[data-region-field="province"]')!.open).toBe(true);
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(region.querySelector<HTMLDetailsElement>('[data-region-field="province"]')!.open).toBe(false);expect(root.querySelector<HTMLDetailsElement>('#outer')!.open).toBe(true);
  const counts=new Map([['주꾸미+갑오징어',2],['갑오징어',3]]);renderSpeciesFilter(species,counts,'all',[],vi.fn());species.querySelector<HTMLDetailsElement>('#species-panel')!.open=true;species.querySelector<HTMLButtonElement>('[data-species="주꾸미+갑오징어"]')!.focus();renderSpeciesFilter(species,counts,'all',['주꾸미+갑오징어'],vi.fn());expect((document.activeElement as HTMLElement).dataset.species).toBe('주꾸미+갑오징어');expect(document.activeElement?.getAttribute('aria-label')).toContain('포함으로');expect(species.querySelector<HTMLDetailsElement>('#species-panel')!.open).toBe(true);
  species.querySelector<HTMLInputElement>('[data-species-choice="갑오징어"]')!.focus();renderSpeciesFilter(species,counts,{mode:'options',keys:['갑오징어']},[],vi.fn());expect((document.activeElement as HTMLInputElement).checked).toBe(true);renderSpeciesFilter(species,counts,'all',[],vi.fn(),'조회 중');expect(document.activeElement).toBe(root.querySelector('#species>summary'));
});
test('background day/month updates preserve full source identity and disclosure state, then safely fall back if an event disappears',()=>{
  const root=mount();root.innerHTML='<section id="day"></section><section id="month"></section>';
  const s=emptyState();s.month='2026-11';s.boats=[{uid:'1',name:'동명 시험선',port:'비응항',url:'https://thefishing.kr/reservation/list.php?uid=1'}];s.selectedUids=['1'];s.tiers.tier1=['1'];
  s.events=[1,2].map(n=>({id:String(n),uid:'1',date:'2026-11-06',trip:'쭈꾸미, 갑오징어',species:'쭈꾸미, 갑오징어',port:'비응항',departure:n===1?'05:00':'13:00',remaining:3,verified:true,source:'api',observedAt:new Date().toISOString()}));
  const result=()=>queryMonth(s,{month:s.month,requiredPeople:1,tier:'all',search:'',matchingOnly:false}),day=root.querySelector<HTMLElement>('#day')!,month=root.querySelector<HTMLElement>('#month')!;
  renderDay(day,s,'2026-11-06','all','',false,result());let links=day.querySelectorAll<HTMLAnchorElement>('a');expect(links[0].getAttribute('aria-label')).toContain('05:00');expect(links[1].getAttribute('aria-label')).toContain('13:00');expect(links[0].rel).toBe('noopener noreferrer');links[1].focus();renderDay(day,s,'2026-11-06','all','',false,result());expect((document.activeElement as HTMLElement).dataset.focusKey).toBe('day-source:1:2');
  const tide=day.querySelector<HTMLDetailsElement>('.day-tide-details')!;tide.open=true;tide.querySelector<HTMLElement>('summary')!.focus();renderDay(day,s,'2026-11-06','all','',false,result());expect(day.querySelector<HTMLDetailsElement>('.day-tide-details')!.open).toBe(true);expect(document.activeElement?.textContent).toBe('이 날짜의 물때 상세');
  renderMonthlyList(month,s,result(),50,vi.fn(),vi.fn());month.querySelector<HTMLAnchorElement>('a')!.focus();renderMonthlyList(month,s,result(),50,vi.fn(),vi.fn());expect((document.activeElement as HTMLElement).dataset.focusKey).toBe('month-source:1:1');
  day.querySelector<HTMLAnchorElement>('a')!.focus();s.events=[];renderDay(day,s,'2026-11-06','all','',false,result());expect(document.activeElement?.id).toBe('day-heading');
});
