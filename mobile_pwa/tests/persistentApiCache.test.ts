import {afterEach,expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {persistentApiCache} from '../src/apiResponseCache';
import {TheFishingApi} from '../src/providers/thefishingApi';
import {database,FRESH_MS,saveState} from '../src/availabilityStore';
import {emptyState} from '../src/models';
import {importData} from '../src/importLegacy';
const boat={uid:'8765',name:'검증 선박',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=8765'};
const origin='https://persistent.tests.workers.dev',signal=()=>new AbortController().signal;
const success=()=>{const observedAt=new Date().toISOString();return {status:'ALLOWED_READABLE',observedAt,events:[{id:'direct-123456789012345678901234',uid:boat.uid,date:'2026-10-22',trip:'문어',remaining:7,price:100000,departure:'05:00',observedAt}]};};
afterEach(()=>vi.restoreAllMocks());
test('validated results survive a new client through IndexedDB, keep timestamps, and expire after ten minutes',async()=>{
  const payload=success(),request=vi.fn<typeof fetch>(async()=>Response.json(payload));
  const first=await new TheFishingApi(origin,request).readMonth(boat,'2026-10',signal());
  const second=await new TheFishingApi(origin,request).readMonth({...boat,port:'변경 항구'},'2026-10',signal());
  expect(request).toHaveBeenCalledTimes(1);expect(second.cached).toBe(true);expect(second.observedAt).toBe(first.observedAt);expect(second.events[0].port).toBe('변경 항구');
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+FRESH_MS+1);
  await new TheFishingApi(origin,request).readMonth(boat,'2026-10',signal());expect(request).toHaveBeenCalledTimes(2);
});
test('cache is isolated by API origin and cannot be seeded by importing a backup',async()=>{
  const data=success(),state=emptyState();state.boats=[boat];state.events=data.events.map(e=>({...e,verified:true,source:'api' as const,port:''}));
  await saveState(importData(state).state);
  const request=vi.fn<typeof fetch>(async()=>Response.json(data));
  await new TheFishingApi('https://another.tests.workers.dev',request).readMonth(boat,'2026-10',signal());expect(request).toHaveBeenCalledTimes(1);
  await new TheFishingApi('https://different.tests.workers.dev',request).readMonth(boat,'2026-10',signal());expect(request).toHaveBeenCalledTimes(2);
});
test('malformed cache and unavailable device storage fall back to validated API data',async()=>{
  const payload=success(),request=vi.fn<typeof fetch>(async()=>Response.json(payload));
  const bad={get:async()=>({...payload,events:[{...payload.events[0],uid:'1'}]}),put:async()=>{throw new Error('disk full');}};
  expect((await new TheFishingApi(origin,request,bad).readMonth(boat,'2026-10',signal())).status).toBe('ALLOWED_READABLE');expect(request).toHaveBeenCalledTimes(1);
  const broken={...bad,get:async()=>{throw new Error('storage disabled');}};
  expect((await new TheFishingApi(origin,request,broken).readMonth(boat,'2026-10',signal())).status).toBe('ALLOWED_READABLE');expect(request).toHaveBeenCalledTimes(2);
});
test('persistent cache is bounded and preserves simultaneous writes without touching app state',async()=>{
  const state=emptyState();state.requiredPeople=8;await saveState(state);
  const result={status:'ALLOWED_READABLE' as const,message:'ok',events:[],observedAt:new Date().toISOString()};
  await Promise.all(Array.from({length:260},(_,i)=>persistentApiCache.put(`bounded|${i}|2026-11`,result)));
  expect(await persistentApiCache.get('bounded|0|2026-11')).toBeUndefined();expect(await persistentApiCache.get('bounded|259|2026-11')).toEqual(result);
  const db=await database();const contents=await new Promise<any[]>(resolve=>{const tx=db.transaction('local'),req=tx.objectStore('local').getAll();tx.oncomplete=()=>{db.close();resolve(req.result);};});
  expect(contents.find(row=>row.schema===1)?.requiredPeople).toBe(8);
  expect(contents.find(Array.isArray)).toHaveLength(256);
});
