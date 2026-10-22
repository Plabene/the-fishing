import { expect, test, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import calendar from './fixtures/month-202609.html?raw';
import { MonthlyService, sourceProvider, type Store } from '../availability_api/service';
import { handleRequest } from '../availability_api/worker';
import { TheFishingDirect } from '../src/providers/thefishingDirect';
import type { ProviderResult } from '../src/provider';
class MemoryStore implements Store {
  data=new Map<string,unknown>();
  async get<T>(key:string) {return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T) {this.data.set(key,structuredClone(value));}
  async delete(key:string) {return this.data.delete(key);}
}
const success=():ProviderResult=>({status:'ALLOWED_READABLE',events:[],observedAt:new Date().toISOString(),message:'ok'});
const detail=`<script>var data='date6='+date6+'&st_uid=981&pa_uid=6130';$.ajax({url:'../reservation/list.view.view.1.ajax.new.php'});</script>`;
test('server DOM parses the same real-format calendar and does not expose raw HTML',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(detail)).mockResolvedValueOnce(new Response(calendar));
  const provider=new TheFishingDirect(fetcher,0,1000,parseHTML('<html></html>').document as unknown as Document);
  const result=await new MonthlyService(new MemoryStore(),provider).query('6130','2026-09');
  expect(result.status).toBe('ALLOWED_READABLE');expect(result.events).toHaveLength(17);
  expect(result.events[0].remaining).toBe(2);expect(result.events.every(e=>e.source==='api')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('<script>');expect(fetcher).toHaveBeenCalledTimes(2);
});
test('server DOM recognizes security HTML before trying a calendar POST',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('<h1>Access Denied</h1>'));
  const provider=new TheFishingDirect(fetcher,0,1000,parseHTML('<html></html>').document as unknown as Document);
  const result=await new MonthlyService(new MemoryStore(),provider).query('6130','2026-09');
  expect(result.status).toBe('ACCESS_RESTRICTED');expect(fetcher).toHaveBeenCalledTimes(1);
});
test('worker transport rejects redirects without using the unsupported edge redirect error mode',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:302,headers:{Location:'https://example.org'}}));
  vi.stubGlobal('fetch',fetcher);
  try {
    const result=await sourceProvider().readMonth({uid:'6130',name:'',port:'',url:'https://thefishing.kr/reservation/list.php?uid=6130'},'2026-10',new AbortController().signal);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');expect(result.httpStatus).toBe(302);expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {vi.unstubAllGlobals();}
});
test('persistent success cache survives coordinator replacement and retains observation time',async()=>{
  const store=new MemoryStore(),readMonth=vi.fn().mockResolvedValue(success());
  const result=await new MonthlyService(store,{readMonth}).query('6130','2026-09');
  const again=await new MonthlyService(store,{readMonth}).query('6130','2026-09');
  expect(again.cached).toBe(true);expect(again.observedAt).toBe(result.observedAt);expect(readMonth).toHaveBeenCalledTimes(1);
});
test('previous species cache is replaced without clearing the persistent request budget',async()=>{
  const store=new MemoryStore(),readMonth=vi.fn().mockResolvedValue({...success(),message:'new classification'});
  await store.put('month:species-v2:563:2026-10',{expires:Date.now()+600000,result:{...success(),message:'old classification'}});
  await store.put('limits',{windowStart:Date.now(),count:7,blockedUntil:0});
  const result=await new MonthlyService(store,{readMonth}).query('563','2026-10');
  expect(result.cached).not.toBe(true);expect(readMonth).toHaveBeenCalledTimes(1);
  expect((await store.get<{count:number}>('limits'))?.count).toBe(8);
  const cached=await new MonthlyService(store,{readMonth}).query('563','2026-10');
  expect(cached.cached).toBe(true);expect(cached.observedAt).toBe(result.observedAt);expect(readMonth).toHaveBeenCalledTimes(1);
});
test('validated metadata persists across coordinator replacement while monthly data is fetched separately',async()=>{
  const store=new MemoryStore(),calls:string[]=[];
  const request=vi.fn<typeof fetch>(async(_input,init)=>{
    calls.push(init?.method || 'GET');
    if(init?.method!=='POST') return new Response(detail);
    const compact=(init.body as URLSearchParams).get('date6')!;
    return new Response(`<div data-month="${compact.slice(0,4)}-${compact.slice(4)}"></div><table></table>`);
  });
  vi.stubGlobal('fetch',request);
  try {
    expect((await new MonthlyService(store).query('6130','2026-10')).status).toBe('ALLOWED_READABLE');
    expect((await new MonthlyService(store).query('6130','2026-11')).status).toBe('ALLOWED_READABLE');
    expect(calls).toEqual(['GET','POST','POST']);
  } finally {vi.unstubAllGlobals();}
});
test('duplicates share work while three different boats overlap and a fourth waits',async()=>{
  const resolvers:Array<(value:ProviderResult)=>void>=[];
  const readMonth=vi.fn(()=>new Promise<ProviderResult>(r=>{resolvers.push(r);}));
  const service=new MonthlyService(new MemoryStore(),{readMonth});
  const a=service.query('1','2026-10'),b=service.query('1','2026-10');
  const others=['2','3','4'].map(uid=>service.query(uid,'2026-10'));
  await vi.waitFor(()=>expect(readMonth).toHaveBeenCalledTimes(3));resolvers[0](success());
  await vi.waitFor(()=>expect(readMonth).toHaveBeenCalledTimes(4));resolvers.slice(1).forEach(resolve=>resolve(success()));
  expect(await a).toEqual(await b);
  expect((await Promise.all(others)).every(r=>r.status==='ALLOWED_READABLE')).toBe(true);
});
test('access restriction cooldown and request budget are persistent across instances',async()=>{
  const store=new MemoryStore(),readMonth=vi.fn().mockResolvedValue({status:'ACCESS_RESTRICTED',events:[],message:'403',httpStatus:403,stop:true});
  await new MonthlyService(store,{readMonth}).query('1','2026-10');
  const blocked=await new MonthlyService(store,{readMonth}).query('2','2026-10');
  expect(blocked.status).toBe('ACCESS_RESTRICTED');expect(readMonth).toHaveBeenCalledTimes(1);
  await store.put('limits',{windowStart:Date.now(),count:60,blockedUntil:0});
  expect((await new MonthlyService(store,{readMonth}).query('3','2026-10')).status).toBe('API_BUSY');expect(readMonth).toHaveBeenCalledTimes(1);
});
test('HTTP gateway allows the deployment origin and exact GET query only',async()=>{
  const fetcher=vi.fn(async()=>Response.json(success()));
  const env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName:()=>'',get:()=>({fetch:fetcher})}} as never;
  const request=(path:string,origin='https://plabene.github.io',method='GET')=>new Request('https://api.test'+path,{method,headers:{Origin:origin}});
  const health=await handleRequest(request('/health'),env);expect(health.status).toBe(200);expect((await health.json()).service).toBe('thefishing-availability');
  const response=await handleRequest(request('/v1/month?uid=6130&month=2026-10'),env);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://plabene.github.io');expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
  for(const path of ['/v1/month?uid=6130&month=2026-10&url=https://evil.test','/v1/month?uid=1&uid=2&month=2026-10','/v1/month?uid=../1&month=2026-10','/member/popup.php']) expect((await handleRequest(request(path),env)).ok).toBe(false);
  expect((await handleRequest(request('/v1/month?uid=6130&month=2026-10','https://evil.test'),env)).status).toBe(403);
  expect((await handleRequest(request('/v1/month?uid=6130&month=2026-10',undefined,'POST'),env)).status).toBe(405);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
