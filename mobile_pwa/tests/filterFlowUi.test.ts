// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {defaultFleet} from '../src/defaultFleet';
import {saveState,loadState} from '../src/availabilityStore';
import captured from './fixtures/species-real-20261026.json';

test('mixed options and multi-tier requests survive refresh; panels close only after successful completion and keep selection',async()=>{
  const state=emptyState(),fleet=defaultFleet();state.month='2026-11';
  state.boats=[fleet.boats.find(b=>b.uid==='sunsang24:ship:312')!,fleet.boats.find(b=>b.uid==='1441')!,...['9988','9989'].map(uid=>({uid,name:'추가 시험'+uid,port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`}))];
  state.selectedUids=state.boats.map(b=>b.uid);state.tiers={tier1:['sunsang24:ship:312'],tier2:['1441'],tier3:['9988'],other:['9989']};await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const pending:{url:string;resolve:(r:Response)=>void}[]=[];
  const network=vi.fn<typeof fetch>((url,init)=>new Promise((resolve,reject)=>{pending.push({url:String(url),resolve});init?.signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});}));vi.stubGlobal('fetch',network);
  try {
    await import('../src/main');const el=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    const panelIds=['region-toggle','search-section','species-toggle'],panel=(id:string)=>el('#'+id) as HTMLDetailsElement;
    const open=()=>panelIds.forEach(id=>panel(id).open=true);
    const submit=()=>el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));
    const respond=(start:number,failTf=false)=>{
      for(const p of pending.slice(start)) {
        const sun=p.url.includes('sunsang24'),observedAt=new Date().toISOString();
        const events=captured.events.filter(e=>sun?e.uid==='sunsang24:ship:312':e.uid==='1441').map(e=>({...e,observedAt}));
        p.resolve(Response.json(failTf&&!sun?{status:'HTTP_ERROR',httpStatus:500,events:[],message:'test failure',stop:false}:{status:'ALLOWED_READABLE',observedAt,fresh:true,cached:false,month:'2026-11',host:'pigho.sunsang24.com',shipIds:['312'],events}));
      }
    };
    const month=el('#month') as HTMLInputElement;month.value='2026-11';month.dispatchEvent(new Event('change'));await settle();
    el('[data-tier="none"]').click();await settle();el('[data-tier="tier1"]').click();await settle();el('[data-tier="tier2"]').click();await settle();
    expect(el('#query-target').textContent).toContain('2척');expect(el('[data-tier="tier1"]').getAttribute('aria-pressed')).toBe('true');expect(el('[data-tier="tier3"]').getAttribute('aria-pressed')).toBe('false');
    open();submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(2));expect(panelIds.every(id=>panel(id).open)).toBe(true);expect(el('#app').dataset.queryState).toBe('loading');
    expect(pending.some(p=>/uid=998[89]/.test(p.url))).toBe(false);respond(0);await settle();
    expect(panelIds.some(id=>panel(id).open)).toBe(false);expect(el('#app').dataset.queryState).toBe('success');
    panel('species-toggle').querySelector<HTMLElement>('summary')!.click();
    for(const key of ['주꾸미','갑오징어','주꾸미+갑오징어']) expect(el(`[data-species-choice="${key}"]`)).not.toBeNull();
    el('[data-species-choice="갑오징어"]').click();await settle();expect(el('#summary').textContent).toContain('1개 출조');
    el('.calendar-day[aria-label^="2026-11-06"]').click();expect(el('#day-view').textContent).not.toContain('꽃돼지호');
    el('#species-none').click();await settle();el('[data-species-choice="주꾸미+갑오징어"]').click();await settle();
    expect(el('#day-view').textContent).toContain('꽃돼지호');expect(el('#day-view').textContent).toContain('쭈꾸미ㆍ갑오징어');
    const preferences=(await loadState() as AppState).selectedSpecies;expect(preferences).toEqual({mode:'options',keys:['주꾸미+갑오징어']});
    open();for(const id of panelIds) {el(`[data-close-panel="${id}"]`).click();expect(panel(id).open).toBe(false);panel(id).querySelector<HTMLElement>('summary')!.click();expect(panel(id).open).toBe(true);}
    expect((await loadState() as AppState).selectedSpecies).toEqual(preferences);
    submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(4));expect(panelIds.every(id=>panel(id).open)).toBe(true);respond(2);await settle();
    expect(panelIds.some(id=>panel(id).open)).toBe(false);expect(el('#day-view').textContent).toContain('꽃돼지호');
    expect((await loadState() as AppState).selectedSpecies).toEqual(preferences);expect((await loadState() as AppState).selectedTiers).toEqual(['tier1','tier2']);
    open();submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(6));respond(4,true);await settle();
    expect(el('#app').dataset.queryState).toBe('partial');expect(panelIds.every(id=>panel(id).open)).toBe(true);expect(el('#query-phase').textContent).toBe('조회 일부 완료');
    // A successful query with no filter matches also collapses panels, preserving the empty selection.
    el('#species-none').click();await settle();submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(8));respond(6);await settle();
    expect(el('#app').dataset.queryState).toBe('empty');expect(panelIds.some(id=>panel(id).open)).toBe(false);expect((await loadState() as AppState).selectedSpecies).toEqual([]);
    open();submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(10));el('#stop-query').click();await settle();expect(el('#app').dataset.queryState).toBe('cancelled');expect(panelIds.every(id=>panel(id).open)).toBe(true);
    el('#selected-boats').click();expect((el('#fleet-section') as HTMLDetailsElement).open).toBe(true);
    el('#search-reset').click();await settle();expect((await loadState() as AppState).selectedTiers).toBe('all');expect((await loadState() as AppState).selectedSpecies).toBe('all');expect((await loadState() as AppState).tiers).toEqual(state.tiers);expect((await loadState() as AppState).selectedUids).toEqual(state.selectedUids);
    expect(network).toHaveBeenCalledTimes(10);
  } finally {vi.unstubAllGlobals();}
});
