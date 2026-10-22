import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {TheFishingApi} from '../src/providers/thefishingApi';
import {database,saveState} from '../src/availabilityStore';
import {emptyState} from '../src/models';
const boat={uid:'8765',name:'검증 선박',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=8765'};
const origin='https://persistent.tests.workers.dev',signal=()=>new AbortController().signal;
const success=(remaining=7)=>{const observedAt=new Date().toISOString();return {status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-123456789012345678901234',uid:boat.uid,date:'2026-10-22',trip:'문어',remaining,price:100000,departure:'05:00',observedAt}]};};

test('each click and a new client read updated seats instead of prior device data',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(success(7))).mockResolvedValueOnce(Response.json(success(0))).mockResolvedValueOnce(Response.json(success(2)));
  const client=new TheFishingApi(origin,request);
  expect((await client.readMonth(boat,'2026-10',signal())).events[0].remaining).toBe(7);
  expect((await client.readMonth(boat,'2026-10',signal())).events[0].remaining).toBe(0);
  expect((await new TheFishingApi(origin,request).readMonth(boat,'2026-10',signal())).events[0].remaining).toBe(2);
  expect(request).toHaveBeenCalledTimes(3);
  for(const [url,init] of request.mock.calls) {expect(String(url)).toContain('&fresh=1');expect(init?.cache).toBe('no-store');}
});

test('old IndexedDB response cache and saved app observations never supply live seats',async()=>{
  const state=emptyState(),data=success(99);state.boats=[boat];state.events=data.events.map(e=>({...e,verified:true,source:'api' as const,port:''}));await saveState(state);
  const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('local','readwrite');tx.objectStore('local').put(data,`api-response:species-v3:${origin}|${boat.uid}|2026-10`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
  const request=vi.fn<typeof fetch>(async()=>Response.json(success(1)));
  const result=await new TheFishingApi(origin,request).readMonth(boat,'2026-10',signal());expect(request).toHaveBeenCalledTimes(1);expect(result.events[0].remaining).toBe(1);
});

test.each([{fresh:false,cached:true},{fresh:true,cached:true},{fresh:undefined,cached:false}])('old API success cannot masquerade as freshly read seats: %j',async flags=>{
  const request=vi.fn<typeof fetch>(async()=>Response.json({...success(),...flags}));
  const result=await new TheFishingApi(origin,request).readMonth(boat,'2026-10',signal());
  expect(result.status).toBe('API_UNAVAILABLE');expect(result.events).toEqual([]);expect(result.message).toContain('원본을 새로 조회한 응답이 아닙니다');
});

test('a failed second query never falls back to the first successful seats',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(success())).mockRejectedValueOnce(new Error('offline'));
  const client=new TheFishingApi(origin,request);expect((await client.readMonth(boat,'2026-10',signal())).events).toHaveLength(1);
  const failed=await client.readMonth(boat,'2026-10',signal());expect(failed.status).toBe('API_UNAVAILABLE');expect(failed.events).toEqual([]);expect(request).toHaveBeenCalledTimes(2);
});
