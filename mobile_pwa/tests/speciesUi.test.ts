// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { emptyState } from '../src/models';
import { saveState, loadState } from '../src/availabilityStore';
test('species controls filter calendar/list/day, persist choices, switch months and preserve records without fetch',async()=>{
  const state=emptyState();state.month='2026-10';state.boats=[{uid:'998899',name:'어종 시험호',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=998899'}];state.selectedUids=['998899'];state.tiers.tier1=['998899'];
  state.events=['쭈꾸미/갑오징어','문어','기본 출조'].map((trip,i)=>({id:String(i),uid:'998899',date:'2026-10-26',trip,port:'',departure:'',remaining:10,verified:true,observedAt:new Date().toISOString(),source:'imported' as const}));
  state.events.push({...state.events[1],id:'next',date:'2026-11-26'});await saveState(state);
  document.body.innerHTML='<div id="app"></div>';const network=vi.fn();vi.stubGlobal('fetch',network);await import('../src/main');
  const el=(q:string)=>document.querySelector<HTMLElement>(q)!;
  const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  const choose=async(value:string)=>{const select=el('#species-select') as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('change'));await settle();};
  expect(el('#summary').textContent).toContain('3개 출조');await choose('갑오징어');expect(el('#summary').textContent).toContain('1개 출조');
  expect(el('#calendar').textContent).toContain('쭈꾸미ㆍ갑오징어');el('#view-list').click();expect(el('#month-results').textContent).toContain('어종 · 쭈꾸미ㆍ갑오징어');expect(el('#month-results').textContent).not.toContain('어종 · 문어');
  el('.month-date-heading').click();expect(el('#day-view').textContent).toContain('어종 · 쭈꾸미ㆍ갑오징어');
  const month=el('#month') as HTMLInputElement;month.value='2026-11';month.dispatchEvent(new Event('change'));await settle();expect(el('#summary').textContent).toContain('0개 출조');expect((el('#species-select') as HTMLSelectElement).value).toBe('갑오징어');
  await choose('문어');expect(el('#summary').textContent).toContain('1개 출조');
  el('[data-species="문어"]').click();await settle();expect(el('#summary').textContent).toContain('0개 출조');expect(el('#species-filter').textContent).toContain('제외 1개');
  el('#species-all').click();await settle();expect(el('#summary').textContent).toContain('1개 출조');
  const saved=await loadState() as typeof state;expect(saved.events.filter(e=>e.uid==='998899')).toHaveLength(4);expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
