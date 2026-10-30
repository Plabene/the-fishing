// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {vesselFetch} from './vesselFetch';
import {emptyState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';
import {defaultFleet} from '../src/defaultFleet';

test('species become available only after collection; multi-select, platform, region and ship changes reuse returned data',async()=>{
  const state=emptyState();state.month='2026-11';state.selectedPlatform='sunsang24';
  state.boats=[{uid:'9986',name:'가나 시험호',port:'인천남항',region:{sea:'서해권',province:'인천',local:''},url:'https://thefishing.kr/reservation/list.php?uid=9986'},defaultFleet().boats.find(b=>b.uid==='sunsang24:ship:1530')!];state.selectedUids=state.boats.map(b=>b.uid);state.tiers.tier1=['9986'];state.tiers.tier2=[state.boats[1].uid];await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const responses:((response:Response)=>void)[]=[],request=vi.fn<typeof fetch>(()=>new Promise(resolve=>responses.push(resolve)));vi.stubGlobal('fetch',vesselFetch(request));
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));await settle();
    const requestedMonth=el('#month') as HTMLInputElement;requestedMonth.value='2026-11';requestedMonth.dispatchEvent(new Event('change'));await settle();
    expect(el('[data-platform="all"]').getAttribute('aria-pressed')).toBe('true');
    expect(el('#species-filter').dataset.state).toBe('disabled');expect((el('#species-all') as HTMLButtonElement).disabled).toBe(true);
    expect(el('#search-section')).toBeNull();
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
    expect(el('#species-selection-summary').textContent).toContain('조회 중');
    const observedAt=new Date().toISOString();
    for(const [i,[url]] of request.mock.calls.entries()) {
      const sun=String(url).includes('sunsang24'),uid=sun?'sunsang24:ship:1530':'9986';
      responses[i](Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,host:'doji.sunsang24.com',month:'2026-11',shipIds:['1530'],events:(sun?['갑오징어,문어']:['주꾸미','갑오징어']).map((trip,n)=>({id:sun?'sunsang24-schedule-456':`direct-12345678901234567890123${n}`,uid,date:'2026-11-25',trip,species:trip,remaining:5,departure:'05:00',observedAt,verified:true,reservationStatus:'available'}))}));
    }
    await settle();expect(el('#summary').textContent).toContain('3개 출조');expect(el('#species-filter').dataset.state).toBe('ready');
    expect(el('#platform-results').textContent).toContain('더피싱1/1척 확인');expect(el('#platform-results').textContent).toContain('선상241/1척 확인');
    el('[data-species-choice="갑오징어+문어"]').click();await settle();
    expect(el('#summary').textContent).toContain('1개 출조');expect(request).toHaveBeenCalledTimes(2);
    el('[data-platform="thefishing"]').click();await settle();expect(el('#summary').textContent).toContain('0개 출조');expect(document.querySelector('[data-species-choice="문어"]')).toBeNull();
    expect((await loadState() as typeof state).selectedSpecies).toEqual({mode:'options',keys:['갑오징어+문어']});
    el('[data-platform="all"]').click();await settle();expect(el('#summary').textContent).toContain('1개 출조');
    el('#region-province input[value="인천광역시"]').click();await settle();
    expect(el('#summary').textContent).toContain('0개 출조');expect(el('#boats').textContent).toContain('가나 시험호');expect(document.querySelector('[data-species-choice="문어"]')).toBeNull();
    expect((await loadState() as typeof state).selectedSpecies).toEqual({mode:'options',keys:['갑오징어+문어']});
    el('#region-reset').click();await settle();el('[data-tier="tier2"]').click();await settle();
    expect(el('#summary').textContent).toContain('1개 출조');expect(document.querySelector('[data-species-choice="주꾸미"]')).toBeNull();expect(request).toHaveBeenCalledTimes(2);
    const month=el('#month') as HTMLInputElement;month.value='2026-12';month.dispatchEvent(new Event('change'));await settle();expect(el('#species-filter').dataset.state).toBe('disabled');expect(el('#summary').textContent).toContain('0개 출조');
  } finally {vi.unstubAllGlobals();}
});
