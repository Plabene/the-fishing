// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';
import {defaultFleet} from '../src/defaultFleet';

test('platform selector scopes boat management and live query; Sunsang disabled state preserves TheFishing result and refreshes next month',async()=>{
  const state=emptyState();state.month='2026-10';state.boats=[{uid:'9987',name:'기존 더피싱 시험호',port:'',url:'https://thefishing.kr/reservation/list.php?uid=9987'},defaultFleet().boats.find(b=>b.uid==='sunsang24:ship:698')!];state.selectedUids=state.boats.map(b=>b.uid);await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{const u=new URL(String(input)),month=u.searchParams.get('month')!,observedAt=new Date().toISOString();return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-123456789012345678901234',uid:'9987',date:`${month}-25`,trip:'문어',remaining:3,departure:'05:00',observedAt}]});});vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));await settle();
    const change=async(s:string,value:string)=>{(el(s) as HTMLSelectElement).value=value;el(s).dispatchEvent(new Event('change'));await settle();};
    expect(el('#boats').querySelector('.platform-thefishing')).not.toBeNull();expect(el('#boats').querySelector('.platform-sunsang24')).not.toBeNull();
    await change('#platform-filter','sunsang24');expect(el('#boats').textContent).not.toContain('기존 더피싱 시험호');
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).not.toHaveBeenCalled();expect(el('#query-status').textContent).toContain('연동 이용 허가');expect(el('#summary').textContent).toContain('0개 출조');
    await change('#platform-filter','all');el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(1);expect(el('#summary').textContent).toContain('1개 출조');
    el('.calendar-day[aria-label^="2026-10-25"]').click();expect(el('#day-view').querySelector('.platform-thefishing')).not.toBeNull();expect(el('#day-view').textContent).toContain('3석');
    await change('#platform-filter','thefishing');expect(el('#boats').querySelector('.platform-sunsang24')).toBeNull();
    await change('#month','2026-11');expect(el('#summary').textContent).toContain('0개 출조');el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(2);expect(String(request.mock.calls[1][0])).toContain('month=2026-11');
    expect((await loadState() as typeof state & {selectedPlatform:string}).selectedPlatform).toBe('thefishing');
  } finally {vi.unstubAllGlobals();}
});
