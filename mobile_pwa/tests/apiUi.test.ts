// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {vesselFetch} from './vesselFetch';
import { emptyState } from '../src/models';
import { loadState, saveState } from '../src/availabilityStore';
test('a user connects the API then reads and saves a month without browser requests to the source',async()=>{
  localStorage.clear();localStorage.setItem('thefishing-availability-api','');const state=emptyState();state.month='2026-10';state.boats=[{uid:'6130',name:'검증 선박',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=6130'}];state.selectedUids=['6130'];state.tiers.tier1=['6130'];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';
  const observedAt=new Date().toISOString();
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({service:'thefishing-availability',schema:1,ready:true})).mockResolvedValueOnce(Response.json({status:'ALLOWED_READABLE',observedAt,fresh:true,cached:false,events:[{id:'direct-123456789012345678901234',uid:'6130',date:'2026-10-22',trip:'출조',remaining:4,price:100000,departure:'05:00',observedAt}]}));
  vi.stubGlobal('fetch',vesselFetch(request));await import('../src/main');expect(request).not.toHaveBeenCalled();
  document.querySelector('#query-form')!.dispatchEvent(new Event('submit',{cancelable:true}));expect(request).not.toHaveBeenCalled();expect(document.querySelector('#message')?.textContent).toContain('API를 먼저 연결');
  (document.querySelector('#api-url') as HTMLInputElement).value='https://fishing.example.workers.dev';
  document.querySelector('#api-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect(document.querySelector('#message')?.textContent).toContain('API 연결을 확인'));
  document.querySelector('#query-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect(document.querySelector('#live-progress')?.textContent).toContain('성공 1척'));
  expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.every(([url])=>String(url).startsWith('https://fishing.example.workers.dev/'))).toBe(true);
  expect(document.querySelector('#summary')?.textContent).toContain('1개 출조 일정');
  const saved=await loadState() as typeof state;expect(saved.events.find(e=>e.date==='2026-10-22')?.source).toBe('api');
  vi.unstubAllGlobals();localStorage.clear();
});
