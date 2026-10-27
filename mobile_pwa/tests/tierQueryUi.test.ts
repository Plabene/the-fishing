// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';

test('region/tier summary, target requests and calendar agree without individual selection or network on filter changes',async()=>{
  const state=emptyState();state.boats=['9981','9982','9983'].map(uid=>({uid,name:`시험 ${uid}`,port:'비응항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:'전북',local:'군산'}}));
  state.tiers={tier1:['9981'],tier2:['9982'],tier3:[],other:[]};state.selectedUids=['9983'];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{
    const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();
    return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-12345678901234567890'+uid,uid,date:month+'-06',trip:'갑오징어',remaining:4,verified:true,observedAt}]});
  });vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    expect(el('#query-target').textContent).toContain('2척');const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);expect(new Set(ids).size).toBe(ids.length);
    for(const removed of ['#search-section','#search','#selected-boats','#select-all','#select-none','#selected-only','.boat-row input[type=checkbox]']) expect(el(removed)).toBeNull();
    expect(el('#region-toggle').compareDocumentPosition(el('#tabs')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el('#tabs').compareDocumentPosition(el('#query-form')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    el('#region-province input[value="전북특별자치도"]').click();await settle();
    el('#region-local input[value="군산"]').click();await settle();
    expect(el('#reservation-filter-summary').textContent).toContain('전북특별자치도 · 군산');
    expect(el('#region-toggle').classList.contains('has-selection')).toBe(true);
    expect(el('#region-local input[value="군산"]').parentElement!.classList.contains('is-selected')).toBe(true);
    el('[data-tier="tier1"]').focus();el('[data-tier="tier1"]').click();await settle();expect(document.activeElement).toBe(el('[data-tier="tier1"]'));el('[data-tier="tier2"]').focus();el('[data-tier="tier2"]').click();await settle();expect(document.activeElement).toBe(el('[data-tier="tier2"]'));
    expect(el('#tier-selection-summary').textContent).toBe('티어 · 1티어 · 2티어');expect(request).not.toHaveBeenCalled();
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();
    expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.map(([url])=>new URL(String(url)).searchParams.get('uid')).sort()).toEqual(['9981','9982']);
    expect(request.mock.calls.every(([url])=>String(url).includes('fresh=1'))).toBe(true);
    expect(el('#summary').textContent).toContain('2개 출조');expect(el('#app').dataset.queryState).toBe('success');
    const scroll=vi.fn();el('#day-view').scrollIntoView=scroll;vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));el('.calendar-day').click();expect(scroll).toHaveBeenLastCalledWith({block:'nearest',behavior:'auto'});vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:query.includes('max-width')})));el('.calendar-day').click();expect(scroll).toHaveBeenLastCalledWith({block:'nearest',behavior:'smooth'});
    const saved=await loadState() as AppState;expect(saved.tiers).toEqual(state.tiers);expect(saved.selectedUids).toEqual(['9983']);
    el('#next').click();await settle();expect(el('#summary').textContent).toContain('0개 출조');expect(el('#reservation-filter-summary').textContent).toContain('군산');expect(request).toHaveBeenCalledTimes(2);
  } finally {vi.unstubAllGlobals();}
});
