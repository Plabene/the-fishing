import {expect,test,vi} from 'vitest';
import {parseSchedule,SUNSANG_AREAS,Sunsang24Service} from '../availability_api/sunsang24';
import {Sunsang24Api,IntegratedProvider} from '../src/providers/sunsang24Api';
import {collectMonth} from '../src/liveQuery';
import {defaultFleet} from '../src/defaultFleet';
import {SUNSANG24_LIVE_ENABLED,sunsangListing} from '../src/platforms';
import {eventStatus} from '../src/availabilityStore';
import {emptyState} from '../src/models';
import {handleRequest} from '../availability_api/worker';
import type {Store} from '../availability_api/service';
const area=SUNSANG_AREAS.get('500')!,at=()=>new Date().toISOString(),signal=()=>new AbortController().signal;
const row=(id=1,shipId='698')=>({schedule_no:String(id),sdate:'2026-10-25',stime:'05:00:00',fish_type:'주꾸미',remain_embarkation_num:4,price:90000,schedule_status_code:'ING',schedule_status_name:'예약가능',ship:{no:shipId,name:'테스트호',area_main:'충남',area_sub:'태안',area:'태안인근'}});
const hierarchy={area:[{no:403,title:'충남',items:[{no:-403,name:'전체'},{no:500,name:'태안'}]}]};
class Memory implements Store {data=new Map<string,unknown>();async get<T>(k:string){return this.data.get(k) as T|undefined;}async put<T>(k:string,v:T){this.data.set(k,v);}async delete(k:string){this.data.delete(k);}}
const sun=defaultFleet().boats.find(b=>b.uid==='sunsang24:ship:698')!;

test('production access gate sends zero requests on client and server, including repeat clicks',async()=>{
  const request=vi.fn<typeof fetch>();expect(SUNSANG24_LIVE_ENABLED).toBe(false);
  for(let i=0;i<2;i++) {
    expect((await new Sunsang24Service(new Memory(),false,request).query('500','2026-10')).status).toBe('PERMISSION_DENIED');
    const result=await new Sunsang24Api('https://fishing.example.workers.dev',request).readMonth(sun,'2026-10',signal());
    expect(result.status).toBe('PERMISSION_DENIED');expect(result.events).toEqual([]);expect(result.stop).toBe(false);
  }
  expect(request).not.toHaveBeenCalled();
});
test('PC parser fields preserve actual seats, unknown counts, prices, species and distinct reservation state',async()=>{
  const event=await parseSchedule(row(),area,'2026-10',at());
  expect(event).toMatchObject({uid:sun.uid,departure:'05:00',remaining:4,price:90000,port:'',reservationStatus:'available',verified:true});
  expect(event.species).toContain('주꾸미');expect(event.reservationUrl).toContain('ship_no=698&sdate=2026-10-25');
  const closed=await parseSchedule({...row(),schedule_status_code:'END',remain_embarkation_num:null,price:0},area,'2026-10',at());
  expect(closed.remaining).toBeNull();expect(closed.price).toBeNull();expect(eventStatus(closed,emptyState())).toBe('UNAVAILABLE');
  const unknown=await parseSchedule({...row(),schedule_status_code:'NEW',schedule_status_name:'새 상태'},area,'2026-10',at());expect(unknown.verified).toBe(false);
});
test('wrong province, child and date never become successful monthly data',async()=>{
  for(const patch of [{sdate:'2026-11-01'},{sdate:'2026-10-32'},{ship:{...row().ship,area_main:'전남'}},{ship:{...row().ship,area_sub:'홍성'}}]) await expect(parseSchedule({...row(),...patch},area,'2026-10',at())).rejects.toThrow();
});
test('scheduleless formatting differences produce stable IDs but different trips remain separate',async()=>{
  const base={...row(),schedule_no:'',price:'100,000'},a=await parseSchedule(base,area,'2026-10',at());
  expect((await parseSchedule({...base,price:100000,stime:'05:00'},area,'2026-10',at())).id).toBe(a.id);
  expect((await parseSchedule({...base,stime:'06:00'},area,'2026-10',at())).id).not.toBe(a.id);
});
test('region query consumes all pages and never stores seats; a later button run reads schedules again',async()=>{
  const store=new Memory(),request=vi.fn<typeof fetch>(async input=>{
    const url=String(input);if(url.includes('filter_area')) return Response.json(hierarchy);
    const page=new URL(url).searchParams.get('page');return Response.json({total:31,list:page==='1'?Array.from({length:30},(_,i)=>row(i+1)):[row(31)]});
  });
  const server=new Sunsang24Service(store,true,request,0);
  const [a,b]=await Promise.all([server.query('500','2026-10'),server.query('500','2026-10')]);
  expect(a.status).toBe('ALLOWED_READABLE');expect(a.events).toHaveLength(31);expect(a).toEqual(b);expect(request).toHaveBeenCalledTimes(3);
  expect(JSON.stringify([...store.data])).not.toContain('remaining');
  await server.query('500','2026-10');expect(request).toHaveBeenCalledTimes(5);
});
test.each(['duplicate','empty','changed','large','stale-region'])('incomplete %s response exposes no partial seats',async mode=>{
  let pages=0;const request=vi.fn<typeof fetch>(async input=>{
    if(String(input).includes('filter_area')) return Response.json(mode==='stale-region'?{area:[]}:hierarchy);
    pages++;return Response.json({total:mode==='large'?601:mode==='changed'&&pages>1?3:2,list:mode==='empty'?[]:[row()]});
  });
  const result=await new Sunsang24Service(new Memory(),true,request,0).query('500','2026-10');
  expect(result.status).toBe('PARSER_UNSUPPORTED');expect(result.events).toEqual([]);expect(result.fresh).not.toBe(true);
});
test('403 persists cooldown and never retries or uses stale schedules',async()=>{
  const request=vi.fn<typeof fetch>(async()=>new Response('',{status:403})),store=new Memory();
  expect((await new Sunsang24Service(store,true,request,0).query('500','2026-10')).status).toBe('ACCESS_RESTRICTED');
  expect((await new Sunsang24Service(store,true,request,0).query('500','2026-11')).status).toBe('ACCESS_RESTRICTED');expect(request).toHaveBeenCalledTimes(1);
});
test.each(['TIMEOUT','NETWORK_OR_CORS','HTTP_ERROR'] as const)('source %s is isolated and returns no seats',async status=>{
  const request=vi.fn<typeof fetch>(async()=>{if(status==='TIMEOUT') throw new DOMException('timeout','TimeoutError');if(status==='NETWORK_OR_CORS') throw new TypeError('network');return new Response('',{status:500});});
  const result=await new Sunsang24Service(new Memory(),true,request,0).query('500','2026-10');expect(result.status).toBe(status);expect(result.events).toEqual([]);
});
test('client groups same-area vessels once per run and new run/month refreshes without old seats',async()=>{
  const boats=defaultFleet().boats.filter(b=>sunsangListing(b.uid)?.areaId==='500').slice(0,3);
  const request=vi.fn<typeof fetch>(async input=>{
    const month=new URL(String(input)).searchParams.get('month')!,observedAt=at();
    const events=await Promise.all(boats.map((b,i)=>parseSchedule({...row(i+1,sunsangListing(b.uid)!.shipId),sdate:month+'-25'},area,month,observedAt)));
    return Response.json({area:'500',month,status:'ALLOWED_READABLE',events,observedAt,fresh:true,cached:false});
  });
  const run=()=>new Sunsang24Api('https://fishing.example.workers.dev',request,true);
  const first=run();expect((await Promise.all(boats.map(b=>first.readMonth(b,'2026-10',signal())))).every(r=>r.events.length===1)).toBe(true);expect(request).toHaveBeenCalledTimes(1);
  await run().readMonth(boats[0],'2026-10',signal());await run().readMonth(boats[0],'2026-11',signal());expect(request).toHaveBeenCalledTimes(3);
});
test('one platform stop or exception does not prevent the other platform completing',async()=>{
  const tf={uid:'1',name:'TF',port:'',url:''},ok={status:'ALLOWED_READABLE' as const,events:[],message:'ok',observedAt:at(),fresh:true};
  for(const fails of ['thefishing','sunsang24']) {
    const readMonth=vi.fn(async()=>{throw new Error('platform down');});
    const provider=new IntegratedProvider(fails==='thefishing'?{readMonth}:{readMonth:async()=>ok},fails==='sunsang24'?{readMonth}:{readMonth:async()=>ok});
    const result=await collectMonth(provider,[tf,{...tf,uid:'2'},sun],'2026-10',signal(),()=>{},1);
    expect(result.rows.find(r=>r.boat.uid===(fails==='thefishing'?sun.uid:'1'))?.result.status).toBe('ALLOWED_READABLE');
    expect(result.stopped).toBe(true);
  }
});
test('Worker uses a separate coordinator and rejects arbitrary URL/unknown area parameters',async()=>{
  const names:string[]=[],fetch=vi.fn(async()=>Response.json({status:'PERMISSION_DENIED',events:[]}));
  const env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName:(n:string)=>{names.push(n);return n;},get:()=>({fetch})}} as never;
  expect((await handleRequest(new Request('https://worker/v1/sunsang24/month?area=500&month=2026-10&fresh=1'),env)).status).toBe(200);expect(names).toEqual(['sunsang24-v1']);
  for(const query of ['area=99999&month=2026-10&fresh=1','area=500&month=2026-10&fresh=1&url=https://evil.test','area=500&month=2026-10&fresh=1&area=501']) expect((await handleRequest(new Request('https://worker/v1/sunsang24/month?'+query),env)).status).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(1);
});
