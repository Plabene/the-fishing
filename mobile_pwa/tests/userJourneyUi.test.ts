// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {loadState,saveState} from '../src/availabilityStore';

test('query, date details, official link and zero-target recovery keep persisted tiers intact',async()=>{
  const state=emptyState();state.boats=['9971','9972','9973'].map(uid=>({uid,name:`여정 ${uid}`,port:'비응항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:'전북',local:'군산'}}));
  state.boats[2].region={sea:'서해권',province:'충남',local:'보령'};state.boats[2].port='오천항';state.tiers.tier1=['9971'];state.tiers.tier2=['9972','9973'];state.selectedUids=['9971'];await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{
    const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();
    return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[0,...(uid==='9971'?[1]:[])].map(index=>({id:'direct-1234567890123456789'+uid+index,uid,date:month+'-06',trip:'갑오징어',remaining:4,price:100000,port:'비응항',departure:index?'13:00':'05:00',observedAt}))});
  });vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    expect(request).not.toHaveBeenCalled();
    let clicks=0;el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));clicks++;await settle();
    const month=(el('#month') as HTMLInputElement).value,day=el(`.calendar-day[aria-label^="${month}-06"]`);
    day.click();clicks++;expect(el('#day-view').querySelectorAll('.event-card')).toHaveLength(4);
    expect(el('#day-view').textContent).toContain('여정 9973');expect(el('#day-view').textContent).toContain('조회 당시 잔여 4석');expect(el('#day-view').textContent).toContain('05:00');expect(el('#day-view').textContent).toContain('관측');
    const link=el('#day-view .source-link') as HTMLAnchorElement;
    const opened=vi.fn();link.addEventListener('click',event=>{event.preventDefault();opened(link.href);});link.click();clicks++;
    expect(opened).toHaveBeenCalledWith('https://thefishing.kr/reservation/list.php?uid=9971');expect(clicks).toBe(3);
    expect(day.querySelector('.calendar-overflow')?.textContent).toBe('+1척 더 보기');expect(day.getAttribute('aria-label')).toContain('선박 3척');
    expect(el('#query-result-state').textContent).toBe('완료');expect(el('#query-result-counts').textContent).toContain('확인 3척 · 실패/미지원 0척 · 미조회 0척');
    expect(el('#query-result-scope').textContent).toContain('현재 대상 3척');
    el('#region-province input[value="전북특별자치도"]').click();await settle();el('#region-province input[value="충청남도"]').click();await settle();
    el('[data-tier="tier1"]').click();await settle();el('[data-tier="tier2"]').click();await settle();
    expect(el('#query-result-scope').textContent).toContain('전북특별자치도');expect(el('#query-result-scope').textContent).toContain('충청남도');expect(el('#query-result-scope').textContent).toContain('1티어 · 2티어');
    el('[data-species-choice="갑오징어"]').click();await settle();el('#matching-only').click();el('#view-list').click();expect(el('#month-results').querySelectorAll('.monthly-result')).toHaveLength(4);
    el('.month-date-heading').click();expect(el('#calendar-layout').hidden).toBe(false);expect(el('#day-view').querySelectorAll('.event-card')).toHaveLength(4);expect(request).toHaveBeenCalledTimes(3);
    el('[data-tier="none"]').click();await settle();el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));
    expect(el('#message').textContent).toContain('조회할 선박이 없습니다');expect(el('#query-result-state').textContent).toBe('조회 대상 없음');expect(el('#recovery-fleet').hidden).toBe(false);
    el('#recovery-fleet').click();expect(document.activeElement).toBe(el('#fleet-search'));expect((el('#fleet-section') as HTMLDetailsElement).open).toBe(true);
    const saved=await loadState() as AppState;expect(saved.tiers).toEqual(state.tiers);expect(saved.selectedUids).toEqual(state.selectedUids);expect(request).toHaveBeenCalledTimes(3);
    el('#recovery-region').click();expect((el('#region-toggle') as HTMLDetailsElement).open).toBe(true);expect(document.activeElement).toBe(el('#region-toggle>summary'));expect(request).toHaveBeenCalledTimes(3);
    el('[data-tier="tier1"]').click();await settle();
    const offline=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));
    expect(el('#query-result-state').textContent).toBe('실패');expect(el('#query-result-note').textContent).toContain('오프라인');expect(request).toHaveBeenCalledTimes(3);offline.mockRestore();
    el('#api-clear').click();el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));
    expect(el('#query-result-note').textContent).toContain('조회 API를 먼저 연결');expect(document.activeElement).toBe(el('#api-url'));expect(el('#recovery-api').hidden).toBe(false);
    (el('#api-settings') as HTMLDetailsElement).open=false;el('#recovery-api').click();expect((el('#api-settings') as HTMLDetailsElement).open).toBe(true);expect(document.activeElement).toBe(el('#api-url'));expect(request).toHaveBeenCalledTimes(3);
    expect((await loadState() as AppState).tiers).toEqual(state.tiers);
    console.info('UX02 AFTER: query/date/official-link = 3 activations; zero-target recovery = 1 adjacent link activation, opens and focuses tier management; unique overflow = 1 ship from 4 trips/3 ships. No measured scroll distance or task time.');
  } finally {vi.unstubAllGlobals();}
});
