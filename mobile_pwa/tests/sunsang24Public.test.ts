import {expect,test,vi} from 'vitest';
import {parsePublicMonth,robotsAllows,Sunsang24PublicService} from '../availability_api/sunsang24Public';
import {Sunsang24PublicApi} from '../src/providers/sunsang24PublicApi';
import {publicRouteForBoat,SUNSANG_PUBLIC_ROUTES} from '../src/sunsang24PublicRoutes';
import {defaultFleet} from '../src/defaultFleet';
import {handleRequest} from '../availability_api/worker';
import type {Store} from '../availability_api/service';

const at=()=>new Date().toISOString(),signal=()=>new AbortController().signal;
class Memory implements Store {data=new Map<string,unknown>();async get<T>(k:string){return this.data.get(k) as T|undefined;}async put<T>(k:string,v:T){this.data.set(k,v);}async delete(k:string){this.data.delete(k);}}
// Minimal observed DOM, synthetic schedule IDs. Personal reservation rows are intentionally excluded.
const card=(ship='1976',id='123',date='2026-10-25',state='ING',count=4)=>`<table class="ship_unit_ship_no_${ship} ship_unit"><tr><td class="ship_info"><div class="title">시험호</div><button class="btn_user_reservation" data-schedule_no="${id}" data-ship_status_code="${state}">바로예약</button></td><td><ul class="reservation_detail" data-sdate="${date}" data-schedule_no="${id}"><li class="fishspecies"><div id="fish">주꾸미,갑오징어</div></li><li class="shiptime"><div class="detail">06:00 ~ 16:00</div></li><li class="reservation_complete">반드시 버릴 예약자 정보</li><li class="small_event">버릴 메모</li></ul></td><td class="ship_info2"><li class="remain">${state==='ING'?`남은자리<br><span class="number">${count}명</span>`:`<span class="shipping_status" data-status_code="${state}">${state==='END'?'예약마감':'전화예약'}</span><span class="number">21명</span>`}<br>예약/<span class="number">17명</span></li></td></tr></table>`;
const page=(cards=card(),month='2026-10')=>`<div class="month_nav">${month.slice(0,4)}년 ${Number(month.slice(5))}월 &gt;</div>${cards}`;
const response=(body:string)=>new Response(body,{headers:{'Content-Type':'text/html'}});
const host='akbari.sunsang24.com';
const boat=(id:string)=>defaultFleet().boats.find(b=>b.uid===`sunsang24:ship:${id}`)!;

test('public parser preserves explicit seats, species, departure; never booked totals or personal rows',()=>{
  const result=parsePublicMonth(page(),host,'2026-10',at());
  expect(result).toMatchObject({status:'ALLOWED_READABLE',fresh:true,cached:false,shipIds:['1976']});
  expect(result.events[0]).toMatchObject({remaining:4,price:null,departure:'06:00',speciesKey:'주꾸미+갑오징어',reservationStatus:'available',verified:true});
  expect(JSON.stringify(result)).not.toMatch(/예약자|메모/);
  expect(parsePublicMonth(page(card().replace('남은자리','<span class="shipping_status n_gray">출항확정</span><br>남은자리')),host,'2026-10',at()).events[0].remaining).toBe(4);
  for(const state of ['END','call','NEW']) {
    const event=parsePublicMonth(page(card('1976','123','2026-10-25',state)),host,'2026-10',at()).events[0];
    expect(event.remaining).toBeNull();expect(event.reservationStatus).toBe(state==='END'?'closed':'unknown');
  }
});
test('wrong month, missing ship identity, duplicates and mismatching action IDs fail closed',()=>{
  for(const html of [page('', '2026-11'),page(card('99999')),page(card()+card()),page(card().replace('data-schedule_no="123"','data-schedule_no="456"')),page(card().replace('2026-10-25','2026-11-25'))]) expect(()=>parsePublicMonth(html,host,'2026-10',at())).toThrow();
});
test('copied calendars inside operator notices cannot override live seats or poison sibling vessel parsing',()=>{
  const copied=card('1976','999','2026-09-01','ING',999);
  const html=page(card('1976','123','2026-10-25','ING',4).replace('버릴 메모',`<div class="editor_memo_pc">${copied}</div>`));
  const result=parsePublicMonth(html,host,'2026-10',at());expect(result.events).toHaveLength(1);expect(result.events[0]).toMatchObject({id:'sunsang24-schedule-123',remaining:4,date:'2026-10-25'});
});
test('robots specific groups, wildcard rules and longest allow exception are respected',()=>{
  expect(robotsAllows('User-agent: Googlebot\nAllow: /\nUser-agent: bingbot\nDisallow: /','/ship/schedule_fleet/202610')).toBe(true);
  expect(robotsAllows('User-agent: *\nDisallow: /','/ship/schedule_fleet/202610')).toBe(false);
  expect(robotsAllows('User-agent: *\nDisallow: /ship/*\nAllow: /ship/schedule_fleet/','/ship/schedule_fleet/202610')).toBe(true);
  expect(robotsAllows('User-agent: *\nAllow: /\nUser-agent: TheFishingAvailability\nDisallow: /ship/','/ship/schedule_fleet/202610')).toBe(false);
  expect(robotsAllows('User-agent: *\nDisallow: /ship/schedule_fleet$','/ship/schedule_fleet/202610')).toBe(true);
});
test('server shares only in-flight homepage reads, refreshes next request/month and stores no seats',async()=>{
  const store=new Memory(),request=vi.fn<typeof fetch>(async input=>String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):response(page(card('1976','123',String(input).endsWith('202611')?'2026-11-25':'2026-10-25'),String(input).endsWith('202611')?'2026-11':'2026-10')));
  const service=new Sunsang24PublicService(store,request);
  const [a,b]=await Promise.all([service.query('1976','2026-10'),service.query('2171','2026-10')]);
  expect(a).toEqual(b);expect(a.status).toBe('ALLOWED_READABLE');expect(request).toHaveBeenCalledTimes(2);
  await service.query('1976','2026-10');await service.query('1976','2026-11');expect(request).toHaveBeenCalledTimes(4);
  expect(JSON.stringify([...store.data])).not.toMatch(/remaining|schedule-123|予約|예약자/);
  expect(request.mock.calls.every(([url,init])=>!String(url).includes('api.sunsang24') && init?.cache==='no-store' && init?.redirect==='manual')).toBe(true);
});
test('robots denial makes no calendar request; 403 cooldown is isolated to its host',async()=>{
  const denied=vi.fn<typeof fetch>(async()=>response('User-agent: *\nDisallow: /'));
  const policy=await new Sunsang24PublicService(new Memory(),denied).query('1976','2026-10');expect(policy.status).toBe('PERMISSION_DENIED');expect(policy.stop).toBe(false);expect(denied).toHaveBeenCalledTimes(1);
  const request=vi.fn<typeof fetch>(async input=>String(input).includes('akbari')?new Response('',{status:403}):String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):response(page(card('1530'))));
  const service=new Sunsang24PublicService(new Memory(),request);
  expect((await service.query('1976','2026-10')).status).toBe('ACCESS_RESTRICTED');expect((await service.query('2171','2026-11')).status).toBe('ACCESS_RESTRICTED');
  expect((await service.query('1530','2026-10')).status).toBe('ALLOWED_READABLE');expect(request).toHaveBeenCalledTimes(3);
});
test('client groups siblings per click, separates month, and rejects absent ship or stale result',async()=>{
  const request=vi.fn<typeof fetch>(async input=>{
    const month=new URL(String(input)).searchParams.get('month')!;
    return Response.json(parsePublicMonth(page(card('1976','123',`${month}-25`)+card('2171','456',`${month}-25`),month),host,month,at()));
  });
  const run=()=>new Sunsang24PublicApi('https://fishing.example.workers.dev',request),first=run();
  const results=await Promise.all(['1976','2171'].map(id=>first.readMonth(boat(id),'2026-10',signal())));
  expect(results.map(r=>r.events[0]?.uid)).toEqual(['sunsang24:ship:1976','sunsang24:ship:2171']);expect(request).toHaveBeenCalledTimes(1);
  await run().readMonth(boat('1976'),'2026-10',signal());await first.readMonth(boat('1976'),'2026-11',signal());expect(request).toHaveBeenCalledTimes(3);
  expect((await first.readMonth(boat('2299'),'2026-10',signal())).status).toBe('UNVERIFIED');
  const stale=vi.fn<typeof fetch>(async()=>Response.json({...parsePublicMonth(page(),host,'2026-10',at()),cached:true}));
  expect((await new Sunsang24PublicApi('https://fishing.example.workers.dev',stale).readMonth(boat('1976'),'2026-10',signal())).status).toBe('API_UNAVAILABLE');
});
test('legacy IDs remain mapped; unresolved names do not trigger any guessed request',async()=>{
  expect(publicRouteForBoat('external:c4ebfacb32593d90a212')?.host).toBe('doublek.sunsang24.com');
  const request=vi.fn<typeof fetch>();expect((await new Sunsang24PublicApi('https://fishing.example.workers.dev',request).readMonth(boat('2068'),'2026-10',signal())).status).toBe('UNSUPPORTED_SOURCE');expect(request).not.toHaveBeenCalled();
  for(const route of SUNSANG_PUBLIC_ROUTES.values()) expect(route.host).toMatch(/^[a-z0-9-]+\.sunsang24\.com$/);
});
test('legacy linked vessel preserves its saved UID and current calendar link',async()=>{
  const legacy=defaultFleet().boats.find(b=>b.uid==='external:c4ebfacb32593d90a212')!;
  const request=vi.fn<typeof fetch>(async()=>Response.json(parsePublicMonth(page(card('1867')),'doublek.sunsang24.com','2026-10',at())));
  const result=await new Sunsang24PublicApi('https://fishing.example.workers.dev',request).readMonth(legacy,'2026-10',signal());
  expect(result.status).toBe('ALLOWED_READABLE');expect(result.events[0].uid).toBe(legacy.uid);expect(result.events[0].reservationUrl).toContain('ship_no=1867');
});
test.each(['TIMEOUT','NETWORK_OR_CORS','HTTP_ERROR'] as const)('public %s does not stop other vessels',async status=>{
  const request=vi.fn<typeof fetch>(async()=>{if(status==='TIMEOUT') throw new DOMException('timeout','TimeoutError');if(status==='NETWORK_OR_CORS') throw new TypeError('network');return new Response('',{status:503});});
  const result=await new Sunsang24PublicService(new Memory(),request).query('1976','2026-10');expect(result.status).toBe(status);expect(result.stop).toBe(false);expect(result.events).toEqual([]);
});
test('public worker path rejects arbitrary hosts, unknown ships, duplicate params, and routes separately',async()=>{
  const fetch=vi.fn(async()=>Response.json({status:'test'})),idFromName=vi.fn((x:string)=>x),env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName,get:()=>({fetch})}} as never;
  for(const suffix of ['ship=1&month=2026-10&fresh=1','ship=1976&month=2026-10&fresh=1&url=https://evil.test','ship=1976&ship=1530&month=2026-10&fresh=1']) expect((await handleRequest(new Request('https://worker/v1/sunsang24/public-month?'+suffix),env)).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();const good=await handleRequest(new Request('https://worker/v1/sunsang24/public-month?ship=1976&month=2026-10&fresh=1'),env);
  expect(good.headers.get('Cache-Control')).toBe('no-store');expect(idFromName).toHaveBeenCalledWith('sunsang24-public-v1');
});
test('default fetch keeps the runtime receiver instead of binding to the service instance',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=function(this:unknown,input:RequestInfo|URL) {
    expect(this===undefined || this===globalThis).toBe(true);
    return Promise.resolve(String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):response(page()));
  } as typeof fetch;
  try {expect((await new Sunsang24PublicService(new Memory()).query('1976','2026-10')).status).toBe('ALLOWED_READABLE');}
  finally {globalThis.fetch=original;}
});

test('public catalog caches identity metadata only; a later seat query still reads the origin',async()=>{
  const store=new Memory(),html=page(card('903'))+'<div class="col-xs-6">오시는길 : 전북 군산시</div>',request=vi.fn<typeof fetch>(async input=>String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):response(html));
  const service=new Sunsang24PublicService(store,request),first=await service.catalog('blackpink.sunsang24.com');
  expect(first).toMatchObject({status:'OK',cached:false,boats:[{shipId:'903',province:'전북특별자치도',local:'군산'}]});
  expect(await service.catalog('blackpink.sunsang24.com')).toMatchObject({status:'OK',cached:true});expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([...store.data])).not.toMatch(/remaining|예약자|버릴/);
  expect((await service.query('903','2026-10')).status).toBe('ALLOWED_READABLE');expect(request).toHaveBeenCalledTimes(3);
  expect((await service.catalog('api.sunsang24.com')).status).toBe('UNAVAILABLE');expect(request).toHaveBeenCalledTimes(3);
});
test('large fleet public calendars are bounded at 12 MB instead of rejecting legitimate 4 MB pages',async()=>{
  const large=page(card())+'<!--'+' '.repeat(4000001)+'-->',request=vi.fn<typeof fetch>(async input=>String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):response(large));
  expect((await new Sunsang24PublicService(new Memory(),request).query('1976','2026-10')).status).toBe('ALLOWED_READABLE');
});
test('catalog worker validates fixed hosts, duplicate params and CORS',async()=>{
  const fetch=vi.fn(async()=>Response.json({status:'OK'})),env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName:(x:string)=>x,get:()=>({fetch})}} as never;
  for(const suffix of ['host=api.sunsang24.com','host=blackpink.sunsang24.com&host=gosu.sunsang24.com','host=blackpink.sunsang24.com&url=https://evil.test']) expect((await handleRequest(new Request('https://worker/v1/sunsang24/catalog?'+suffix),env)).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();expect((await handleRequest(new Request('https://worker/v1/sunsang24/catalog?host=blackpink.sunsang24.com'),env)).status).toBe(200);
});

test('catalog retries a transient upstream 503 once but never retries an access restriction',async()=>{
  const html=page(card('903'))+'<div class="col-xs-6">오시는길 : 전북 군산시</div>';
  for(const status of [503,403]) {
    let reads=0;
    const request=vi.fn<typeof fetch>(async input=>String(input).endsWith('robots.txt')?response('User-agent: *\nAllow: /'):++reads===1?new Response('',{status}):response(html));
    const result=await new Sunsang24PublicService(new Memory(),request).catalog('blackpink.sunsang24.com');
    expect(result.status).toBe(status===503?'OK':'UNAVAILABLE');expect(reads).toBe(status===503?2:1);
  }
});
