// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState,type AppState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';
import captured from './fixtures/species-real-20261026.json';

test('Sunsang24 paints fresh partial results while three TheFishing calls wait, and a second query fetches all seats again',async()=>{
  const state=emptyState();state.month='2026-11';state.boats=[...['9971','9972','9973'].map(uid=>({uid,name:'가상 선박 '+uid,port:'시험항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`})),{uid:'sunsang24:ship:312',name:'꽃돼지호',port:'오천항',url:'https://www.sunsang24.com/ship/list/?ship_no=312'}];state.tiers.tier1=state.boats.map(b=>b.uid);state.selectedUids=[...state.tiers.tier1];await saveState(state);localStorage.clear();document.body.innerHTML='<div id="app"></div>';
  const pending:{url:string;resolve:(response:Response)=>void}[]=[];
  const network=vi.fn<typeof fetch>((url,init)=>new Promise((resolve,reject)=>{pending.push({url:String(url),resolve});init?.signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});}));vi.stubGlobal('fetch',network);
  try {
    await import('../src/main');const el=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    el<HTMLInputElement>('#month').value=state.month;el('#month').dispatchEvent(new Event('change'));await settle();
    const submit=()=>el('#query-submit').click();submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(4));
    const sun=pending.find(p=>p.url.includes('/public-month'))!,observedAt=new Date().toISOString(),events=captured.events.filter(e=>e.uid==='sunsang24:ship:312').map(e=>({...e,observedAt}));
    sun.resolve(Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,month:state.month,host:'pigho.sunsang24.com',shipIds:['312'],events}));
    await vi.waitFor(()=>expect(el('#summary').textContent).toContain(`${events.length}개 출조`));expect(el('#app').getAttribute('aria-busy')).toBe('true');expect(el('#calendar').textContent).toContain('꽃돼지호');
    for(const p of pending.filter(p=>p!==sun)) p.resolve(Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt:new Date().toISOString(),events:[]}));await settle();
    const saved=await loadState() as AppState;expect(saved.tiers).toEqual(state.tiers);expect(saved.monthChecks).toHaveLength(4);expect(saved.events).toHaveLength(events.length);
    submit();await vi.waitFor(()=>expect(network).toHaveBeenCalledTimes(8));expect(el('#summary').textContent).toContain('0개 출조');
    el('#stop-query').click();await settle();expect(el('#query-result-state').textContent).toBe('취소');expect(el('#summary').textContent).toContain('0개 출조');expect((await loadState() as AppState).tiers).toEqual(state.tiers);
  } finally {vi.unstubAllGlobals();}
});
