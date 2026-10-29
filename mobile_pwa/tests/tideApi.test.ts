import { expect,test,vi } from 'vitest';
import { TideService,parseTideResponse } from '../availability_api/tides';
import { handleRequest } from '../availability_api/worker';
import { readTideMonth } from '../src/providers/tideApi';
import { TIDE_TTL,tideDates } from '../src/tides';
import type { Store } from '../availability_api/service';
import {TIDE_STATIONS,type TideStationCode} from '../src/tideStations';
const sample=(date:string)=>({response:{header:{resultCode:'00'},body:{totalCount:4,items:{item:[['01:00',100,2],['07:00',650,1],['13:00',130,4],['19:00',680,3]].map(([time,level,kind])=>({obsvtrNm:'보령',predcDt:`${date} ${time}`,predcTdlvVl:level,extrSe:kind}))}}}});
class MemoryStore implements Store {data=new Map<string,unknown>();async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;} async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}async delete(key:string){this.data.delete(key);}}
test('official parser checks source/date/completeness and never returns API credential text',()=>{
  const now=new Date().toISOString();expect(parseTideResponse(sample('2026-10-22'),'2026-10-22',now).extrema).toHaveLength(4);
  expect(()=>parseTideResponse(sample('2026-10-21'),'2026-10-22',now)).toThrow();
  const wrong=sample('2026-10-22');wrong.response.body.items.item[0].obsvtrNm='인천';expect(()=>parseTideResponse(wrong,'2026-10-22',now)).toThrow();
  const truncated=sample('2026-10-22');truncated.response.body.totalCount=5;expect(()=>parseTideResponse(truncated,'2026-10-22',now)).toThrow();
  expect(()=>parseTideResponse({response:{header:{resultCode:'30',resultMsg:'secret-key'}}},'2026-10-22',now)).toThrowError(/인증/);
});
test('one monthly request includes boundaries, deduplicates, persists cache and shares days between months',async()=>{
  const store=new MemoryStore(),request=vi.fn<typeof fetch>(async(input)=>{
    const url=new URL(String(input)),date=url.searchParams.get('reqDate')!;
    expect(url.origin+url.pathname).toBe('https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService');expect(url.searchParams.get('serviceKey')).toBe('encoded/key=');expect(url.searchParams.get('obsCode')).toBe('DT_0025');
    return Response.json(sample(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`));
  });
  const now=Date.now(),service=new TideService(store,'encoded%2Fkey%3D',request,()=>now,0);
  const [a,b]=await Promise.all([service.query('2026-10'),service.query('2026-10')]);expect(a).toEqual(b);expect(a.status).toBe('OK');expect(a.days).toHaveLength(33);expect(request).toHaveBeenCalledTimes(33);
  const again=await new TideService(store,'encoded/key=',request,()=>now,0).query('2026-10');expect(again.cached).toBe(true);expect(again.days[0].fetchedAt).toBe(a.days[0].fetchedAt);expect(request).toHaveBeenCalledTimes(33);
  await service.query('2026-11');expect(request).toHaveBeenCalledTimes(63);
  const expired=await new TideService(store,'encoded/key=',request,()=>now+TIDE_TTL+1,0).query('2026-10');expect(expired.cached).not.toBe(true);expect(request).toHaveBeenCalledTimes(96);
});
test('missing credentials, quota and errors fail safely without leaking URLs or fetching other dates indefinitely',async()=>{
  const request=vi.fn<typeof fetch>().mockRejectedValue(new Error('https://upstream/?serviceKey=secret'));
  const store=new MemoryStore(),empty=await new TideService(store,'',request).query('2026-10');expect(empty.status).toBe('UNAVAILABLE');expect(request).not.toHaveBeenCalled();
  const service=new TideService(store,'secret',request,()=>Date.now(),0),failed=await service.query('2026-10');expect(JSON.stringify(failed)).not.toContain('secret');expect(request.mock.calls.length).toBeLessThanOrEqual(3);
  const calls=request.mock.calls.length;await service.query('2026-11');expect(request).toHaveBeenCalledTimes(calls);
  const limited=new MemoryStore();await limited.put('tide-budget',{date:new Date().toISOString().slice(0,10),count:2000});await new TideService(limited,'secret',request).query('2026-10');expect(request).toHaveBeenCalledTimes(calls);
});

test('default transport calls ambient fetch without a service instance receiver (Workers runtime)',async()=>{
  const nativeFetch=vi.fn(function(this:unknown,input:RequestInfo|URL) {
    if(this!==undefined && this!==globalThis) throw new TypeError('Illegal invocation');
    const date=new URL(String(input)).searchParams.get('reqDate')!;
    return Promise.resolve(Response.json(sample(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`)));
  });
  vi.stubGlobal('fetch',nativeFetch);
  try {
    const result=await new TideService(new MemoryStore(),'test-key',undefined,()=>Date.now(),0).query('2026-10');
    expect(result.status).toBe('OK');expect(result.days).toHaveLength(33);expect(nativeFetch).toHaveBeenCalledTimes(33);
  } finally {vi.unstubAllGlobals();}
});
test('tide gateway accepts only a month and routes to a separate object; client rejects wrong source/month',async()=>{
  const month='2026-10',days=tideDates(month).map(date=>parseTideResponse(sample(date),date,new Date().toISOString())),data={schema:1,month,stationCode:'DT_0025',status:'OK',days};
  const idFromName=vi.fn(()=>''),fetcher=vi.fn(async()=>Response.json(data)),env={ALLOWED_ORIGIN:'https://plabene.github.io',MONTHLY:{idFromName,get:()=>({fetch:fetcher})}} as never;
  const url='https://api.test/v1/tides?month=2026-10';expect((await handleRequest(new Request(url),env)).ok).toBe(true);expect(idFromName).toHaveBeenCalledWith('tides-v1');
  for(const suffix of ['&station=other','&serviceKey=private','&month=2026-11','&url=https://evil.test']) expect((await handleRequest(new Request(url+suffix),env)).status).toBe(400);
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json(data));expect((await readTideMonth('https://a.b.workers.dev',month,new AbortController().signal,request)).days).toHaveLength(33);
  expect(request.mock.calls[0][1]?.credentials).toBe('omit');
  request.mockResolvedValue(Response.json({...data,month:'2026-11'}));await expect(readTideMonth('https://a.b.workers.dev',month,new AbortController().signal,request)).rejects.toThrow();
});

test('station-separated durable cache keeps December and future years intact across region switches',async()=>{
 const request=vi.fn<typeof fetch>(async(input)=>{const u=new URL(String(input)),d=u.searchParams.get('reqDate')!,station=u.searchParams.get('obsCode') as TideStationCode;
  const payload=sample(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`);for(const row of payload.response.body.items.item) row.obsvtrNm=TIDE_STATIONS[station].name;return Response.json(payload);
 });
 const store=new MemoryStore(),service=new TideService(store,'private',request,()=>Date.now(),0);
 for(const station of ['DT_0025','DT_0016','DT_0014'] as const) {const result=await service.query('2027-12',station);expect(result.status).toBe('OK');expect(result.days).toHaveLength(33);expect(result.days.every(d=>d.stationCode===station)).toBe(true);}
 expect(request).toHaveBeenCalledTimes(99);expect((await service.query('2027-12','DT_0025')).cached).toBe(true);expect(request).toHaveBeenCalledTimes(99);
 expect((await service.query('2028-02','DT_0016')).days).toHaveLength(31);
});
test('wrong coordinates, station responses and inner-day station mismatch fail closed',async()=>{
 const bad=sample('2026-12-15');Object.assign(bad.response.body.items.item[0],{lat:34.74722,lot:127.76555});expect(()=>parseTideResponse(bad,'2026-12-15',new Date().toISOString())).toThrow(/좌표/);
 const date='2026-12-15',day=parseTideResponse(sample(date),date,new Date().toISOString());
 const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({schema:1,month:'2026-12',stationCode:'DT_0016',status:'PARTIAL',days:[day]}));
 await expect(readTideMonth('https://a.b.workers.dev','2026-12',new AbortController().signal,request,'DT_0016')).rejects.toThrow(/관측소/);
});
test('missing one day remains missing, keeps successful dates and can recover without refetching all days',async()=>{
 let missing=true;const request=vi.fn<typeof fetch>(async(input)=>{const d=new URL(String(input)).searchParams.get('reqDate')!;return Response.json(missing && d==='20261215'?{response:{header:{resultCode:'00'},body:{totalCount:0,items:[]}}}:sample(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`));});
 let now=Date.now();const service=new TideService(new MemoryStore(),'private',request,()=>now,0),partial=await service.query('2026-12');expect(partial.status).toBe('PARTIAL');expect(partial.missingDates).toEqual(['2026-12-15']);expect(partial.days).toHaveLength(32);
 missing=false;now+=60001;const recovered=await service.query('2026-12');expect(recovered.status).toBe('OK');expect(request).toHaveBeenCalledTimes(34);
});
