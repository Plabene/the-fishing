// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';

test('actual UI flags region/platform/tier/month/people changes, keeps search and species local, and preserves legacy tiers',async()=>{
  const state=emptyState();state.month='2026-11';state.boats=['9961','9962','9963'].map((uid,i)=>({uid,name:`테스트${i+1}호`,port:'비응항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:'전북',local:'군산'}}));
  state.tiers={tier1:['9961'],tier2:['9962'],tier3:['9963'],other:[]};state.selectedUids=['9962'];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  let slow=false;const pending:Array<()=>void>=[];
  const network=vi.fn<typeof fetch>(async input=>{const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();if(slow) await new Promise<void>(resolve=>pending.push(resolve));return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-12345678901234567890'+uid,uid,date:month+'-06',trip:uid==='9961'?'쭈꾸미, 갑오징어':'갑오징어',remaining:4,verified:true,observedAt}]});});vi.stubGlobal('fetch',network);
  try {
    await import('../src/main');const el=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    const requestMonth=el<HTMLInputElement>('#month').value;
    const click=async(s:string)=>{el(s).click();await settle();};
    await click('#query-submit');expect(network).toHaveBeenCalledTimes(3);expect(el('#query-result-state').textContent).toBe('완료');
    el<HTMLDetailsElement>('#result-search').open=true;const input=el<HTMLInputElement>('#search');input.focus();input.value='테스트2호';input.dispatchEvent(new Event('input'));expect(document.activeElement).toBe(input);expect(el('#summary').textContent).toContain('1개 출조');
    expect(el('#query-result-state').textContent).toBe('완료');expect(el('#query-result-counts').textContent).toContain('확인 3척');expect(el('#query-result-scope').textContent).toContain('현재 대상 3척');
    await click('#view-list');expect(el('#month-results').textContent).toContain('테스트2호');expect(el('#month-results').textContent).not.toContain('테스트1호');
    input.value='일치하지 않는 선박';input.dispatchEvent(new Event('input'));expect(el('#query-result-note').textContent).toContain('검색어를 지우면');
    await click('#search-clear');expect(el('#summary').textContent).toContain('3개 출조');expect(input.value).toBe('');expect(network).toHaveBeenCalledTimes(3);
    el<HTMLDetailsElement>('#species-toggle').open=true;await click('[data-species-choice="갑오징어"]');expect(el('#summary').textContent).toContain('2개 출조');expect(el('#query-result-state').textContent).toBe('완료');
    await click('#matching-only');expect(el('#query-result-state').textContent).toBe('완료');expect(network).toHaveBeenCalledTimes(3);
    for(const selector of ['[data-platform="thefishing"]','[data-tier="tier1"]','[data-region-choice="province"][value="전북특별자치도"]']) {await click(selector);expect(el('#query-result-state').textContent).toBe('조건 변경 · 새 조회 필요');expect(el('#query-result-counts').textContent).toContain(`이전 조건의 조회: 완료 · ${requestMonth} · 3척`);}
    expect(network).toHaveBeenCalledTimes(3);
    slow=true;el('#query-submit').click();await vi.waitFor(()=>expect(el('#query-result-state').textContent).toBe('조회 중'));expect(el('#source-badge').textContent).not.toContain('조건 변경');pending.splice(0).forEach(resolve=>resolve());await settle();slow=false;expect(el('#query-result-state').textContent).toBe('완료');expect(network).toHaveBeenCalledTimes(4);
    const beforePeople=el<HTMLInputElement>('#people');beforePeople.value='2';beforePeople.dispatchEvent(new Event('change'));await settle();expect(el('#query-result-state').textContent).toBe('조건 변경 · 새 조회 필요');await click('#query-submit');expect(network).toHaveBeenCalledTimes(5);
    await click('#next');expect(el('#query-result-state').textContent).toBe('조건 변경 · 새 조회 필요');expect(el('#query-result-counts').textContent).toContain(`${requestMonth} · 1척`);expect(el('#summary').textContent).toContain('0개 출조');
    const saved=await loadState() as AppState;expect(saved.selectedUids).toEqual(state.selectedUids);expect(saved.tiers).toEqual(state.tiers);
    expect(network.mock.calls.every(([url])=>String(url).includes('fresh=1'))).toBe(true);
  } finally {vi.unstubAllGlobals();}
});
