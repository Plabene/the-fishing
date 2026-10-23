// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import {TheFishingApi} from '../src/providers/thefishingApi';
import {bookingAlias} from '../src/bookingAliases';
import {reservationLink,emptyState} from '../src/models';
import {applyLiveResults,collectMonth} from '../src/liveQuery';
const boat={uid:'external:3e13428ab1e484d50b7e',name:'팀한프로[한프로선장]',port:'오천항',url:'https://teamhanpro.com/index.php?mid=bk'};
const origin='https://fishing.example.workers.dev',month='2026-11';
function payload(uid='5364') {const observedAt=new Date().toISOString();return {status:'ALLOWED_READABLE',observedAt,fresh:true,cached:false,events:[{id:'direct-123456789012345678901234',uid,date:month+'-02',trip:'광어다운샷',remaining:18,observedAt}]};}
test('verified homepage identity uses the existing fresh provider and preserves original UID, tiers and links',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload()));
  const result=await new TheFishingApi(origin,request).readMonth(boat,month,new AbortController().signal);
  expect(request.mock.calls[0][0]).toBe(origin+'/v1/month?uid=5364&month=2026-11&fresh=1');
  expect(result.events[0]).toMatchObject({uid:boat.uid,remaining:18,species:'광어',source:'api',verified:true,reservationUrl:bookingAlias(boat.uid)!.url});
  const state=emptyState();state.boats=[boat];state.tiers.tier1=[boat.uid];state.selectedUids=[boat.uid];
  const applied=applyLiveResults(state,month,[{boat,result}]);
  expect(applied.tiers).toEqual(state.tiers);expect(applied.boats).toEqual([boat]);expect(applied.monthChecks?.[0].uid).toBe(boat.uid);
  expect(reservationLink(result.events[0].reservationUrl,boat.uid)).toBe(bookingAlias(boat.uid)!.url);
  expect(reservationLink('https://thefishing.kr/reservation/list.php?uid=1441',boat.uid)).toBe('');
});
test('unknown, mismatched and cached alias results never become current reservations',async()=>{
  for(const data of [payload('1441'),{...payload(),fresh:false,cached:true},{status:'ACCESS_RESTRICTED',events:[],message:'접근 제한'}]) {
    const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json(data));
    const result=await new TheFishingApi(origin,request).readMonth(boat,month,new AbortController().signal);
    expect(result.status).not.toBe('ALLOWED_READABLE');expect(result.events).toEqual([]);expect(request).toHaveBeenCalledTimes(1);
  }
  expect(bookingAlias('external:unknown')).toBeUndefined();
});
test('alias failure is isolated while another boat succeeds; blocked homepage is never retried',async()=>{
  const normal={uid:'1441',name:'청남호',port:'무창포항',url:'https://thefishing.kr/reservation/list.php?uid=1441'};
  const request=vi.fn<typeof fetch>(async url=>String(url).includes('uid=5364')?Response.json({status:'HTTP_ERROR',httpStatus:403,events:[],message:'차단'}):Response.json(payload('1441')));
  const result=await collectMonth(new TheFishingApi(origin,request),[boat,normal],month,new AbortController().signal,()=>{},2);
  expect(result.rows.find(row=>row.boat.uid==='1441')?.result.events).toHaveLength(1);
  expect(result.rows.find(row=>row.boat.uid===boat.uid)?.result.events).toEqual([]);
  expect(request.mock.calls.every(([url])=>String(url).startsWith(origin+'/v1/month?'))).toBe(true);
});
