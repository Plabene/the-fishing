// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {emptyState} from '../src/models';
import {loadState,saveState} from '../src/availabilityStore';
test('regional API requests, calendar, filtered boat selection and month changes stay consistent',async()=>{
  const state=emptyState();state.month='2026-10';state.boats=[
    {uid:'9987',name:'서해 시험호',port:'오천항',url:'https://thefishing.kr/reservation/list.php?uid=9987',region:{sea:'서해권',province:'충청남도',local:'보령시'}},
    {uid:'9988',name:'남해 시험호',port:'삼천포항',url:'https://thefishing.kr/reservation/list.php?uid=9988',region:{sea:'남해권',province:'경상남도',local:'사천'}},
  ];state.selectedUids=state.boats.map(b=>b.uid);state.tiers.tier1=['9987'];state.tiers.tier2=['9988'];await saveState(state);
  document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-123456789012345678901234',uid,date:`${month}-22`,trip:'문어',species:'문어',speciesKey:'문어',port:'항구',departure:'05:00',remaining:4,verified:true,source:'api',observedAt}]});});vi.stubGlobal('fetch',request);
  await import('../src/main');
  const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
  const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  const change=async (s:string,value:string)=>{(el(s) as HTMLSelectElement).value=value;el(s).dispatchEvent(new Event('change'));await settle();};
  el('#region-sea input[value="서해권"]').click();await settle();expect(el('#boats').textContent).toContain('서해 시험호');expect(el('#boats').textContent).not.toContain('남해 시험호');
  el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(1);expect(String(request.mock.calls[0][0])).toContain('uid=9987');expect(String(request.mock.calls[0][0])).toContain('fresh=1');
  expect(el('#summary').textContent).toContain('1척 대상');el('.calendar-day[aria-label^="2026-10-22"]').click();expect(el('#day-view').textContent).toContain('서해 시험호');
  await change('.boat-row[data-uid="9987"] select','other');expect((await loadState() as typeof state).tiers.other).toEqual(['9987']);
  expect((await loadState() as typeof state).selectedUids).toEqual(state.selectedUids);
  await change('#month','2026-11');expect((el('#region-sea input[value="서해권"]') as HTMLInputElement).checked).toBe(true);expect(el('#summary').textContent).toContain('0개 출조');
  el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(2);expect(String(request.mock.calls[1][0])).toContain('month=2026-11');
  el('#region-reset').click();await settle();expect(el('#boats').textContent).toContain('남해 시험호');expect(request).toHaveBeenCalledTimes(2);vi.unstubAllGlobals();
});
