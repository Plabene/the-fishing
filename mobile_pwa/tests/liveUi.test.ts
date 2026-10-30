// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import {vesselFetch} from './vesselFetch';
import calendar from './fixtures/month-202609.html?raw';
import { emptyState } from '../src/models';
import { loadState, saveState } from '../src/availabilityStore';

test('default query button actually reads the month and persists verified results; page load makes no vessel requests',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const state=emptyState();state.month='2026-09';state.boats=[{uid:'6130',name:'테스트 선박',port:'무창포항',url:'https://thefishing.kr/reservation/list.php?uid=6130'}];state.selectedUids=['6130'];state.tiers.tier1=['6130'];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';
  const detail=`<script>var data='date6='+date6+'&st_uid=981&pa_uid=6130';$.ajax({url:'../reservation/list.view.view.1.ajax.new.php'});</script>`;
  const network=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(detail,{headers:{'Content-Type':'text/html'}})).mockResolvedValueOnce(new Response(calendar,{headers:{'Content-Type':'text/html'}}));
  vi.stubGlobal('fetch',vesselFetch(network));await import('../src/main');
  const month=document.querySelector('#month') as HTMLInputElement;month.value='2026-09';month.dispatchEvent(new Event('change'));await vi.waitFor(()=>expect(document.querySelector('#app')?.getAttribute('aria-busy')).toBe('false'));
  expect(network).not.toHaveBeenCalled();expect((document.querySelector('#query-mode') as HTMLSelectElement).value).toBe('api');(document.querySelector('#query-mode') as HTMLSelectElement).value='direct';
  document.querySelector('#query-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  expect((document.querySelector('#stop-query') as HTMLElement).hidden).toBe(false);
  await vi.waitFor(()=>expect(document.querySelector('#live-progress')?.textContent).toContain('성공 1척'),{timeout:4000});
  expect(network).toHaveBeenCalledTimes(2);
  expect(document.querySelector('#source-badge')?.textContent).toContain('이번 조회 1척');
  expect(document.querySelector('#summary')?.textContent).toContain('17개 출조 일정');
  expect(document.querySelector('#live-rows')?.textContent).toContain('17개 출조 상품을 직접 조회했습니다');
  const saved=await loadState() as typeof state;expect(saved.events.filter(e=>e.date.startsWith('2026-09')).every(e=>e.source==='direct')).toBe(true);
  expect((document.querySelector('#stop-query') as HTMLElement).hidden).toBe(true);
  vi.unstubAllGlobals();
},10000);
