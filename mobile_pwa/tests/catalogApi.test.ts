import {expect,test,vi} from 'vitest';
import {CatalogService} from '../availability_api/catalog';
import {handleRequest} from '../availability_api/worker';
import {validateCatalogPage} from '../scripts/lib/catalog.mjs';
import type {Store} from '../availability_api/service';
class MemoryStore implements Store {
  data=new Map<string,unknown>();
  async get<T>(key:string) {return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T) {this.data.set(key,structuredClone(value));}
  async delete(key:string) {return this.data.delete(key);}
}
const html=(page=1)=>`<title>예약검색 ${page}페이지</title><div class="re_s_total">검색 2건</div><article><h2 class="re_st_2">예약리스트</h2><div class="re_list"><ul><li><a href="https://thefishing.kr/reservation/list.php?uid=11"><span class="re_list_ship">시험호</span><span class="re_list_area">서해권 &gt; 충청남도 &gt; 보령시 &gt; 오천항</span></a></li></ul></div><a class="next10" href="?page=2">끝</a></article><script>privateAccount='never export';</script>`;
const response=(page=1)=>new Response(html(page),{headers:{'content-type':'text/html; charset=utf-8'}});
test('catalog exposes allowlisted metadata only, persists a one-day cache and preserves its observation time',async()=>{
  let now=Date.now();const store=new MemoryStore(),request=vi.fn<typeof fetch>().mockImplementation(async()=>response());
  const first=await new CatalogService(store,request,()=>now,0).query(1);expect(first.status).toBe('OK');
  expect(JSON.stringify(first)).not.toContain('privateAccount');expect(JSON.stringify(first)).not.toContain('<script>');
  now+=3600000;const cached=await new CatalogService(store,request,()=>now,0).query(1);
  expect(cached).toEqual({...first,cached:true});expect(request).toHaveBeenCalledTimes(1);
  now+=86400001;expect((await new CatalogService(store,request,()=>now,0).query(1)).status).toBe('OK');expect(request).toHaveBeenCalledTimes(2);
  expect(String(request.mock.calls[0][0])).toBe('https://thefishing.kr/reservation/list.php');expect(request.mock.calls[0][1]).toMatchObject({method:'GET',credentials:'omit',redirect:'manual'});
});
test('same-page work is coalesced and different pages remain sequential',async()=>{
  const resolvers:Array<(r:Response)=>void>=[],request=vi.fn<typeof fetch>(()=>new Promise(r=>resolvers.push(r))),service=new CatalogService(new MemoryStore(),request,Date.now,0);
  const first=service.query(1),same=service.query(1),second=service.query(2);expect(first).toBe(same);
  await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));resolvers[0](response());
  await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2));resolvers[1](response(2));
  expect((await first).status).toBe('OK');expect((await second).status).toBe('OK');expect(String(request.mock.calls[1][0])).toContain('?page=2');
});
test('HTTP restriction, redirects, security HTML and network failures stop collection without retries and retain cooldown',async()=>{
  for(const outcome of [new Response('',{status:403}),new Response('',{status:302}),new Response('<title>Access Denied</title>',{headers:{'content-type':'text/html'}}),new Error('transport secret')]) {
    const store=new MemoryStore(),request=vi.fn<typeof fetch>().mockImplementation(async()=>{if(outcome instanceof Error) throw outcome;return outcome;});
    const result=await new CatalogService(store,request,Date.now,0).query(1);expect(result.status).toBe('UNAVAILABLE');expect(JSON.stringify(result)).not.toContain('transport secret');
    expect((await new CatalogService(store,request,Date.now,0).query(2)).status).toBe('UNAVAILABLE');expect(request).toHaveBeenCalledTimes(1);
    expect([...store.data.keys()].some(k=>k.startsWith('catalog-page'))).toBe(false);
  }
});
test('persistent daily limit and invalid pages do not make upstream requests',async()=>{
  const store=new MemoryStore(),now=Date.now(),request=vi.fn<typeof fetch>();await store.put('catalog-budget',{day:new Date(now).toISOString().slice(0,10),count:100,lastStart:0,blockedUntil:0});
  const service=new CatalogService(store,request,()=>now,0);
  for(const page of [0,1,101,1.1,NaN]) expect((await service.query(page)).status).toBe('UNAVAILABLE');expect(request).not.toHaveBeenCalled();
});
test('catalog API validates exact parameters and routes into a separate coordinator with no arbitrary URL forwarding',async()=>{
  const coordinatorFetch=vi.fn().mockResolvedValue(Response.json({status:'OK'})),idFromName=vi.fn((name:string)=>name),env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName,get:()=>({fetch:coordinatorFetch})}} as any;
  for(const query of ['page=0','page=101','page=1&page=2','page=1&url=https://evil.example','page=01']) expect((await handleRequest(new Request(`https://api.example/v1/catalog?${query}`),env)).status).toBe(400);
  expect(coordinatorFetch).not.toHaveBeenCalled();
  expect((await handleRequest(new Request('https://api.example/v1/catalog?page=1',{headers:{Origin:'https://evil.example'}}),env)).status).toBe(403);
  const good=await handleRequest(new Request('https://api.example/v1/catalog?page=1'),env);expect(good.status).toBe(200);expect(idFromName).toHaveBeenCalledWith('catalog-v1');expect(coordinatorFetch.mock.calls[0][0].url).toBe('https://coordinator/v1/catalog?page=1');
});
test('catalog API data is independently validated and unexpected fields are stripped before publication',()=>{
  const data={total:1,lastPage:1,boats:[{uid:'1',name:'이름',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=1',phone:'private',region:{sea:'서해권',province:'충남',local:'보령',private:'secret'}}]};
  const valid=validateCatalogPage(data,1);expect(JSON.stringify(valid)).not.toContain('private');expect(JSON.stringify(valid)).not.toContain('secret');
  expect(()=>validateCatalogPage({...data,boats:[{...data.boats[0],url:'https://evil.example'}]},1)).toThrow();expect(()=>validateCatalogPage({...data,total:0},1)).toThrow();
});
