// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';

test('completed boats appear before the batch finishes, remain interactive, and survive cancellation without replacing other boats',async()=>{
  const state=emptyState();state.month='2026-10';
  state.boats=['991','992','993'].map(uid=>({uid,name:`선박 ${uid}`,port:'항구',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`}));state.selectedUids=state.boats.map(b=>b.uid);state.tiers.tier1=[...state.selectedUids];
  state.events=[{id:'old',uid:'992',date:'2026-10-22',trip:'기존 문어',port:'',departure:'',remaining:9,source:'imported',verified:true,observedAt:'2026-10-01T00:00:00Z'}];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';
  const resolvers=new Map<string,(response:Response)=>void>();
  const request=vi.fn<typeof fetch>((input,init)=>new Promise((resolve,reject)=>{resolvers.set(new URL(String(input)).searchParams.get('uid')!,resolve);init?.signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});}));
  vi.stubGlobal('fetch',request);await import('../src/main');
  const before=await loadState() as AppState;
  const el=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
  el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
  const observedAt=new Date().toISOString();resolvers.get('991')!(Response.json({status:'ALLOWED_READABLE',observedAt,fresh:true,cached:false,events:[{id:'direct-123456789012345678901234',uid:'991',date:'2026-10-22',trip:'문어',remaining:4,price:100000,departure:'05:00',observedAt}]}));
  await vi.waitFor(()=>expect(el('#source-badge').textContent).toContain('이번 조회 1척'));
  expect(el('#app').getAttribute('aria-busy')).toBe('true');expect((el('#query-submit') as HTMLButtonElement).disabled).toBe(true);
  const day=el('.calendar-day[aria-label^="2026-10-22"]') as HTMLButtonElement;expect(day.disabled).toBe(false);day.click();expect(el('#day-view').textContent).toContain('조회 당시 잔여 4석');
  el('#view-list').click();expect(el('#month-results').textContent).toContain('선박 991');expect(el('#month-results').textContent).not.toContain('선박 992');expect((el('#query-submit') as HTMLButtonElement).disabled).toBe(true);
  el('#stop-query').click();await vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  const saved=await loadState() as AppState;expect(saved.events.some(e=>e.uid==='991' && e.remaining===4)).toBe(true);expect(saved.events.filter(e=>e.uid==='992')).toEqual(before.events.filter(e=>e.uid==='992'));
  expect(el('#query-result-state').textContent).toBe('취소');expect(el('#query-result-counts').textContent).toContain('확인 1척 · 실패/미지원 0척 · 미조회 2척');expect(el('#query-result-note').textContent).toContain('2척 미확인');expect(el('#recovery-query').hidden).toBe(false);expect(el('#live-progress').textContent).toContain('조회 취소');expect(el('#stop-query').hidden).toBe(true);expect(el('#query-phase').textContent).toBe('조회 취소');expect((el('#query-bar') as HTMLProgressElement).value).toBe(1);expect((el('#query-bar') as HTMLProgressElement).max).toBe(3);vi.unstubAllGlobals();
});
