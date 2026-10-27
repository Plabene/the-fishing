// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';

test('keyboard focus survives tier saves, region/species edits, fleet management, source selection and query cancellation',async()=>{
  const state=emptyState();state.boats=['9971','9972'].map((uid,i)=>({uid,name:`키보드 시험 ${i+1}호`,port:'비응항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:'전북특별자치도',local:'군산'}}));state.selectedUids=state.boats.map(b=>b.uid);state.tiers.tier1=['9971'];state.tiers.tier2=['9972'];await saveState(state);localStorage.clear();document.body.innerHTML='<div id="app"></div>';
  let slow=false;
  const network=vi.fn<typeof fetch>(async(input,init)=>{
    if(slow) return new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
    const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();
    return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-123456789012345678901234',uid,date:month+'-06',trip:uid==='9971'?'쭈꾸미, 갑오징어':'갑오징어',port:'비응항',departure:'05:00',remaining:4,observedAt}]});
  });vi.stubGlobal('fetch',network);
  try {
    await import('../src/main');const el=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    const click=async(selector:string)=>{el(selector).focus();el(selector).click();await settle();};
    const escape=(selector:string)=>{el(selector).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));};
    expect(el('#app').contains(el('#app-announcement'))).toBe(false);
    expect(document.querySelectorAll('[role=status]:not([hidden])')).toHaveLength(1);
    el('#skip-results').click();expect(document.activeElement).toBe(el('#booking-heading'));
    expect(el('#species-toggle-label').hasAttribute('aria-disabled')).toBe(false);el('#species-toggle-label').click();expect(el('#species-selection-summary').textContent).toContain('먼저 조회');escape('#species-toggle-label');expect(el<HTMLDetailsElement>('#species-toggle').open).toBe(false);
    for(const t of ['tier1','tier2']) {await click(`[data-tier="${t}"]`);expect(document.activeElement).toBe(el(`[data-tier="${t}"]`));expect(el(`[data-tier="${t}"]`).getAttribute('aria-pressed')).toBe('true');}
    expect((await loadState() as AppState).selectedTiers).toEqual(['tier1','tier2']);
    el('#region-toggle>summary').click();el('[data-region-field="province"]>summary').click();await click('[data-region-choice="province"][value="전북특별자치도"]');expect((document.activeElement as HTMLInputElement).value).toBe('전북특별자치도');expect(el('#reservation-filter-summary').textContent).toContain('전북특별자치도');escape('[data-region-choice="province"]');expect(document.activeElement).toBe(el('[data-region-field="province"]>summary'));expect(el<HTMLDetailsElement>('#region-toggle').open).toBe(true);escape('[data-region-field="province"]>summary');expect(document.activeElement).toBe(el('#region-toggle>summary'));
    await click('#query-submit');expect(network).toHaveBeenCalledTimes(2);expect(el('#app-announcement').textContent).toContain('조회 완료');expect(document.activeElement).toBe(el('#query-submit'));
    el('#species-toggle-label').click();await click('[data-species-choice="주꾸미+갑오징어"]');expect((document.activeElement as HTMLElement).dataset.speciesChoice).toBe('주꾸미+갑오징어');expect(el('#summary').textContent).toContain('1개 출조');expect(network).toHaveBeenCalledTimes(2);await click('#species-all');escape('#species-all');
    el('#fleet-section>summary').click();const select=el<HTMLSelectElement>('.boat-row[data-uid="9971"] select');select.focus();select.value='tier3';select.dispatchEvent(new Event('change'));await settle();expect(document.activeElement).toBe(el('.boat-row[data-uid="9971"] select'));expect((await loadState() as AppState).tiers.tier3).toContain('9971');
    el('.boat-row[data-uid="9971"] summary').click();await click('[data-focus-key="boat-edit:9971"]');expect(document.activeElement).toBe(el('[name=name]'));el('#edit-cancel').click();expect(document.activeElement).toBe(el('[data-focus-key="boat-edit:9971"]'));el('[data-focus-key="boat-edit:9971"]').click();escape('[name=name]');expect(el<HTMLFormElement>('#boat-form').hidden).toBe(true);expect(document.activeElement).toBe(el('[data-focus-key="boat-edit:9971"]'));
    const source=el('#source-boat');source.closest('details')!.open=true;source.focus();(source as HTMLSelectElement).value='9972';source.dispatchEvent(new Event('change'));expect(document.activeElement).toBe(el('#source-boat'));expect(el('#source-access a').getAttribute('aria-label')).toContain('키보드 시험 2호');
    await click('[data-tier=none]');await click('#query-submit');expect(network).toHaveBeenCalledTimes(2);expect(el('#query-result-state').textContent).toBe('조회 대상 없음');el('#recovery-tiers').click();expect(document.activeElement?.closest('#tabs')).not.toBeNull();
    await click('[data-tier=all]');slow=true;el('#query-submit').focus();el('#query-submit').click();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(4));expect(el('#app').getAttribute('aria-busy')).toBe('true');expect(el('#app-announcement').closest('[aria-busy=true]')).toBeNull();expect(el('#app-announcement').textContent).toContain('시작');el('#stop-query').focus();el('#stop-query').click();await settle();expect(document.activeElement).toBe(el('#query-submit'));expect(el('#app-announcement').textContent).toContain('취소');
    expect((await loadState() as AppState).tiers.tier3).toContain('9971');
  } finally {vi.unstubAllGlobals();}
});
