// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import monthCalendar from './fixtures/month-202609.html?raw';
import multiProduct from './fixtures/multi-product.html?raw';
import closedCalendar from './fixtures/closed.html?raw';
import { webcrypto } from 'node:crypto';
import { TheFishingDirect } from '../src/providers/thefishingDirect';
import { discoverCalendar, parseCalendar, calendarEndpoint } from '../src/providers/thefishingParser';
import { collectMonth, applyLiveResults } from '../src/liveQuery';
import { emptyState, type Boat } from '../src/models';
import { eventStatus } from '../src/availabilityStore';
import { importData } from '../src/importLegacy';
import type { ProviderResult } from '../src/provider';
const boat:Boat={uid:'6130',name:'검증 선박',port:'무창포항',url:'https://thefishing.kr/reservation/list.php?uid=6130'};
const detail=`<script>var data='date6='+date6+'&st_uid=981&pa_uid=6130'; $.ajax({url:'../reservation/list.view.view.1.ajax.new.php'});</script>`;
const fixture=(name:string)=>({'month-202609':monthCalendar,'multi-product':multiProduct,'closed':closedCalendar}[name]!);
const calendar=fixture('month-202609');
const ok=(body:string)=>new Response(body,{status:200,headers:{'Content-Type':'text/html;charset=utf-8'}});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('Real network is forbidden in tests'))));});
afterEach(()=>vi.unstubAllGlobals());

test('direct query performs exactly validated detail GET and monthly POST without cookies or forbidden headers',async()=>{
  const network=vi.fn<typeof fetch>().mockResolvedValueOnce(ok(detail)).mockResolvedValueOnce(ok(calendar));
  const provider=new TheFishingDirect(network,0), result=await provider.readMonth(boat,'2026-09',new AbortController().signal);
  expect(result.status).toBe('ALLOWED_READABLE'); expect(result.events).toHaveLength(17);
  expect(network).toHaveBeenCalledTimes(2);
  expect(network.mock.calls[0][0]).toBe(boat.url);
  const [url,request]=network.mock.calls[1];
  expect(url).toBe('https://thefishing.kr/reservation/list.view.view.1.ajax.new.php');
  expect(request?.method).toBe('POST');expect(request?.credentials).toBe('omit');expect(request?.mode).toBe('cors');expect(request?.redirect).toBe('error');
  expect(String(request?.body)).toBe('date6=202609&st_uid=981&pa_uid=6130');
  const headers=new Headers(request?.headers);for(const header of ['Cookie','Origin','Referer','Authorization']) expect(headers.has(header)).toBe(false);
  expect(result.events[0].remaining).toBe(2);expect(result.events[0].departure).toBe('05:00');expect(result.events[0].price).toBe(100000);
  expect(result.events.every(e=>e.source==='direct' && e.verified)).toBe(true);
  const again=await provider.readMonth(boat,'2026-09',new AbortController().signal);expect(again.cached).toBe(true);expect(network).toHaveBeenCalledTimes(2);
});
test('multiple products, unknown seats and inert untrusted HTML preserve correct meanings',async()=>{
  const html=fixture('multi-product')+'<img src="https://evil.test/a"><script>throw new Error("execute")</script>';
  const events=await parseCalendar(html,boat,'2026-09',new Date().toISOString());
  expect(events).toHaveLength(2); expect(events.map(e=>e.price)).toEqual([130000,150000]);
  expect(events.map(e=>e.trip)).toEqual(['쭈꾸미','갑오징어']);expect(document.querySelector('img')).toBeNull();expect(fetch).not.toHaveBeenCalled();
  const unknown=await parseCalendar(html.replace('남은인원 <span class="num">7</span>명','인원 미표시'),boat,'2026-09',new Date().toISOString());
  expect(unknown[0].remaining).toBeNull();expect(eventStatus(unknown[0],emptyState())).toBe('UNKNOWN');
});
test('wrong month, wrong boat, malformed document and ambiguous empty calendars fail closed',async()=>{
  await expect(parseCalendar(calendar,boat,'2026-10',new Date().toISOString())).rejects.toThrow();
  await expect(parseCalendar(calendar.replaceAll('PA_N_UID=6130','PA_N_UID=1'),boat,'2026-09',new Date().toISOString())).rejects.toThrow('UID');
  await expect(parseCalendar('<html>Unexpected response</html>',boat,'2026-09','')).rejects.toThrow();
  await expect(parseCalendar(fixture('closed'),boat,'2026-09','')).rejects.toThrow();
  const closed=`<div class="re_mon"><a class="on" onclick="type1_ajax('202609')">9월</a></div>${fixture('closed')}`;
  expect(await parseCalendar(closed,boat,'2026-09',new Date().toISOString())).toEqual([]);
});
test.each(['https://evil.test/reservation/list.view.view.1.ajax.new.php','https://thefishing.kr/member/popup.new.php','https://thefishing.kr/reservation/list.view.view.1.ajax.new.php?token=x','https://u:p@thefishing.kr/reservation/list.view.view.1.ajax.php'])('rejects non-calendar endpoint %s',url=>expect(()=>calendarEndpoint(url)).toThrow());
test('mismatched detail metadata never triggers POST and external boats never trigger requests',async()=>{
  expect(()=>discoverCalendar(detail.replace('pa_uid=6130','pa_uid=1'),boat)).toThrow();
  const network=vi.fn<typeof fetch>().mockResolvedValue(ok(detail.replace('pa_uid=6130','pa_uid=1'))),p=new TheFishingDirect(network,0);
  expect((await p.readMonth(boat,'2026-09',new AbortController().signal)).status).toBe('PARSER_UNSUPPORTED');expect(network).toHaveBeenCalledTimes(1);
  expect((await p.readMonth({...boat,uid:'external:1',url:'https://teamhanpro.com/index.php?mid=bk'},'2026-09',new AbortController().signal)).status).toBe('UNSUPPORTED_SOURCE');expect(network).toHaveBeenCalledTimes(1);
});
test.each([401,403,404,429,500])('HTTP %s is reported without retries or a false empty success',async status=>{
  const network=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status}));
  const result=await new TheFishingDirect(network,0).readMonth(boat,'2026-09',new AbortController().signal);
  expect(result.httpStatus).toBe(status);expect(result.status).not.toBe('ALLOWED_READABLE');expect(network).toHaveBeenCalledTimes(1);
  expect(result.stop).toBe([401,403,429].includes(status));
});
test('CORS/network ambiguity and security HTML stop batch; neither becomes a CORS diagnosis without evidence',async()=>{
  const network=vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
  const result=await new TheFishingDirect(network,0).readMonth(boat,'2026-09',new AbortController().signal);
  expect(result.status).toBe('NETWORK_OR_CORS');expect(result.stop).toBe(true);expect(result.httpStatus).toBeUndefined();
  const blocked=vi.fn<typeof fetch>().mockResolvedValue(ok('<h1>Access Denied</h1>'));
  const p=new TheFishingDirect(blocked,0);expect((await p.readMonth(boat,'2026-09',new AbortController().signal)).status).toBe('ACCESS_RESTRICTED');
  await p.readMonth(boat,'2026-10',new AbortController().signal);expect(blocked).toHaveBeenCalledTimes(1);
});
test('timeout and cancellation abort requests without retry',async()=>{
  const network=vi.fn<typeof fetch>().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
  const p=new TheFishingDirect(network,0,15);expect((await p.readMonth(boat,'2026-09',new AbortController().signal)).status).toBe('TIMEOUT');
  expect((await p.readMonth(boat,'2026-10',new AbortController().signal)).status).toBe('TIMEOUT');
  const c=new AbortController(), pending=new TheFishingDirect(network,0,15).readMonth(boat,'2026-09',c.signal);c.abort();await expect(pending).rejects.toThrow();
  expect(network).toHaveBeenCalledTimes(1);
});
test('partial batch updates only successful boats, preserves failed/unattempted history and honors stop/cancel',async()=>{
  const source=emptyState();source.events=[{id:'old',uid:boat.uid,date:'2026-09-09',trip:'old',port:'',departure:'',remaining:9,verified:true,source:'imported',observedAt:'2026-09-01T00:00:00Z'}];
  const other={...boat,uid:'1'};
  const fail:ProviderResult={status:'HTTP_ERROR',events:[],message:'404',httpStatus:404};
  expect(applyLiveResults(source,'2026-09',[{boat,result:fail}]).events).toEqual(source.events);
  const live:ProviderResult={status:'ALLOWED_READABLE',events:[],observedAt:new Date().toISOString(),message:'empty verified'};
  expect(applyLiveResults(source,'2026-09',[{boat,result:live}]).events).toEqual([]);
  const readMonth=vi.fn().mockResolvedValueOnce(live).mockResolvedValueOnce({...fail,stop:true});
  const r=await collectMonth({readMonth},[boat,other,{...boat,uid:'2'}],'2026-09',new AbortController().signal);
  expect(r.rows).toHaveLength(2);expect(r.stopped).toBe(true);expect(readMonth).toHaveBeenCalledTimes(2);
  const cancelled=await collectMonth({readMonth},[boat],'2026-09',AbortSignal.abort());expect(cancelled.cancelled).toBe(true);expect(cancelled.rows).toEqual([]);
});
test('a manually imported backup cannot forge a fresh direct observation',()=>{
  const state=emptyState();state.events=[{id:'forged',uid:boat.uid,date:'2026-09-09',trip:'',port:'',departure:'',remaining:99,verified:true,source:'direct',observedAt:new Date().toISOString()}];
  const imported=importData(state).state;expect(imported.events[0].source).toBe('imported');expect(eventStatus(imported.events[0],imported)).toBe('STALE');
});
