// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState} from '../src/models';
import {saveState,loadState} from '../src/availabilityStore';
import {defaultFleet} from '../src/defaultFleet';

test('platform selector scopes both live sources, integrated calendar keeps names without tags, and month refreshes',async()=>{
  const state=emptyState();state.month='2026-10';state.boats=[{uid:'9987',name:'기존 더피싱 시험호',port:'',url:'https://thefishing.kr/reservation/list.php?uid=9987'},defaultFleet().boats.find(b=>b.uid==='sunsang24:ship:698')!];state.selectedUids=state.boats.map(b=>b.uid);await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{const u=new URL(String(input)),month=u.searchParams.get('month')!,observedAt=new Date().toISOString();
    if(u.pathname.includes('sunsang24')) return Response.json({status:'ALLOWED_READABLE',host:'nature.sunsang24.com',month,shipIds:['698'],fresh:true,cached:false,observedAt,events:[{id:'sunsang24-schedule-123',uid:'sunsang24:ship:698',date:`${month}-25`,trip:'갑오징어',remaining:4,departure:'05:00',observedAt,verified:true,reservationStatus:'available',reservationUrl:`https://www.sunsang24.com/ship/list?ship_no=698&sdate=${month}-25`}]});
    return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-123456789012345678901234',uid:'9987',date:`${month}-25`,trip:'문어',remaining:3,departure:'05:00',observedAt}]});});vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));await settle();
    const change=async(s:string,value:string)=>{(el(s) as HTMLSelectElement).value=value;el(s).dispatchEvent(new Event('change'));await settle();};
    expect(el('#boats').querySelector('.platform-thefishing')).not.toBeNull();expect(el('#boats').querySelector('.platform-sunsang24')).not.toBeNull();
    await change('#platform-filter','sunsang24');expect(el('#boats').textContent).not.toContain('기존 더피싱 시험호');
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(1);expect(el('#query-status').textContent).toContain('공개 예약표 연동 1척');expect(el('#summary').textContent).toContain('1개 출조');
    expect(el('.calendar-day[aria-label^="2026-10-25"]').textContent).toContain('자연피싱호');expect(el('.calendar-day[aria-label^="2026-10-25"]').querySelector('.platform-tag')).toBeNull();
    await change('#platform-filter','all');el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(3);expect(el('#summary').textContent).toContain('2개 출조');
    el('.calendar-day[aria-label^="2026-10-25"]').click();expect(el('#day-view').querySelector('.platform-thefishing')).not.toBeNull();expect(el('#day-view').textContent).toContain('3석');
    await change('#platform-filter','thefishing');expect(el('#boats').querySelector('.platform-sunsang24')).toBeNull();
    await change('#month','2026-11');expect(el('#summary').textContent).toContain('0개 출조');el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(4);expect(String(request.mock.calls[3][0])).toContain('month=2026-11');
    expect((await loadState() as typeof state & {selectedPlatform:string}).selectedPlatform).toBe('thefishing');
  } finally {vi.unstubAllGlobals();}
});
