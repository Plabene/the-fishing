import { expect, test, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { TheFishingDirect } from '../src/providers/thefishingDirect';
import { TheFishingApi } from '../src/providers/thefishingApi';
import { collectMonth } from '../src/liveQuery';
import { MonthlyService, type Store } from '../availability_api/service';
import type { ProviderResult } from '../src/provider';
const boat=(uid:string)=>({uid,name:uid,port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`});
const detail=(uid:string)=>`<script>var data='date6='+date6+'&st_uid=981&pa_uid=${uid}';$.ajax({url:'../reservation/list.view.view.1.ajax.new.php'});</script>`;
const calendar=(uid:string,month:string)=>`<div data-month="${month}"></div><table><tr><td><div class="re_status"><a onclick="t_popup('/member/popup.new.php?date=${month.replace('-','')}26&PA_N_UID=${uid}')">예약하기</a><p>남은인원 20명</p><ul class="schedule2"><li>문어 <span class="price">100,000원</span></li></ul></div></td></tr></table>`;
const success=():ProviderResult=>({status:'ALLOWED_READABLE',fresh:true,cached:false,events:[],observedAt:new Date().toISOString(),message:'ok'});
class MemoryStore implements Store {
  data=new Map<string,unknown>();async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}async delete(key:string){this.data.delete(key);}
}
test('concurrent source reads keep global spacing and reuse boat metadata on month changes',async()=>{
  const starts:number[]=[],methods:string[]=[];
  const request=vi.fn<typeof fetch>(async(input,init)=>{
    starts.push(Date.now());methods.push(init?.method || 'GET');
    if(init?.method==='POST') {const body=init.body as URLSearchParams,compact=body.get('date6')!;return new Response(calendar(body.get('pa_uid')!,`${compact.slice(0,4)}-${compact.slice(4)}`));}
    return new Response(detail(new URL(String(input)).searchParams.get('uid')!));
  });
  const provider=new TheFishingDirect(request,25,1000,parseHTML('<html></html>').document as unknown as Document),signal=new AbortController().signal;
  const first=await Promise.all(['1','2','3'].map(uid=>provider.readMonth(boat(uid),'2026-10',signal)));
  expect(first.every(r=>r.status==='ALLOWED_READABLE')).toBe(true);expect(methods.filter(m=>m==='GET')).toHaveLength(3);
  expect(starts.slice(1).every((t,i)=>t-starts[i]>=24)).toBe(true);
  await provider.readMonth(boat('1'),'2026-11',signal);expect(methods.filter(m=>m==='GET')).toHaveLength(3);expect(methods.filter(m=>m==='POST')).toHaveLength(4);
  await provider.readMonth(boat('1'),'2026-11',signal);expect(request).toHaveBeenCalledTimes(8);
});
test('a blocked first response prevents queued source requests and retry',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:403}));
  const provider=new TheFishingDirect(request,25,1000,parseHTML('<html></html>').document as unknown as Document),signal=new AbortController().signal;
  const results=await Promise.all(['1','2','3'].map(uid=>provider.readMonth(boat(uid),'2026-10',signal)));
  expect(results.every(r=>r.status==='ACCESS_RESTRICTED' && r.stop)).toBe(true);expect(request).toHaveBeenCalledTimes(1);
});
test('parallel batch deduplicates boats, preserves selection order and never starts new boats after stop',async()=>{
  const release=new Map<string,(result:ProviderResult)=>void>();
  const readMonth=vi.fn((b:{uid:string})=>new Promise<ProviderResult>(r=>release.set(b.uid,r)));
  const pending=collectMonth({readMonth},['1','2','1','3','4','5'].map(boat),'2026-10',new AbortController().signal,()=>{},3);
  expect(readMonth).toHaveBeenCalledTimes(3);
  release.get('2')!({status:'ACCESS_RESTRICTED',events:[],message:'403',stop:true});await Promise.resolve();
  release.get('3')!(success());release.get('1')!(success());const result=await pending;
  expect(result.rows.map(r=>r.boat.uid)).toEqual(['1','2','3']);expect(result.total).toBe(5);expect(result.stopped).toBe(true);expect(readMonth).toHaveBeenCalledTimes(3);
});
test('cancel stops dispatch but retains already completed parallel results',async()=>{
  const c=new AbortController();let calls=0;
  const readMonth=vi.fn(async(_b:unknown,_m:unknown,signal:AbortSignal)=>{if(++calls===1)return success();return new Promise<ProviderResult>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));});
  const pending=collectMonth({readMonth},['1','2','3','4'].map(boat),'2026-10',c.signal,rows=>{if(rows.length===1)c.abort();},3);
  const result=await pending;expect(result.cancelled).toBe(true);expect(result.rows).toHaveLength(1);expect(readMonth).toHaveBeenCalledTimes(3);
});
test('previous seats cannot bypass queued source work and cooldown remains shared',async()=>{
  const store=new MemoryStore();const first=new MonthlyService(store,{readMonth:vi.fn().mockResolvedValue(success())});await first.query('9','2026-10');
  const release:Array<(result:ProviderResult)=>void>=[];
  const service=new MonthlyService(store,{readMonth:()=>new Promise(r=>release.push(r))});
  const active=['1','2','3'].map(uid=>service.query(uid,'2026-10'));
  await vi.waitFor(()=>expect(release).toHaveLength(3));const repeat=service.query('9','2026-10');
  release[0]({status:'ACCESS_RESTRICTED',stop:true,message:'403',events:[]});await active[0];release[1](success());release[2](success());await Promise.all(active);
  expect((await repeat).status).toBe('ACCESS_RESTRICTED');expect(await store.get('cache-index')).toBeUndefined();expect(release).toHaveLength(3);
  expect((await service.query('4','2026-10')).status).toBe('ACCESS_RESTRICTED');
});
test('client deduplicates in-flight work but every subsequent query fetches again',async()=>{
  let now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);
  try {
    const read=vi.fn<typeof fetch>(async()=>Response.json(success())),client=new TheFishingApi('https://fishing.example.workers.dev',read),signal=new AbortController().signal;
    const [a,b]=await Promise.all([client.readMonth(boat('1'),'2026-10',signal),client.readMonth(boat('1'),'2026-10',signal)]);
    expect(read).toHaveBeenCalledTimes(1);expect(a).toEqual(b);
    const repeated=await client.readMonth(boat('1'),'2026-10',signal);expect(repeated.cached).toBe(false);expect(repeated.fresh).toBe(true);expect(read).toHaveBeenCalledTimes(2);
    now=Date.parse(a.observedAt!)+600001;await client.readMonth(boat('1'),'2026-10',signal);expect(read).toHaveBeenCalledTimes(3);
  } finally {vi.restoreAllMocks();}
});
test('a long batch waits briefly at the minute boundary instead of losing unattempted boats',async()=>{
  const store=new MemoryStore();await store.put('limits',{windowStart:Date.now()-59950,count:60,blockedUntil:0});
  const readMonth=vi.fn().mockResolvedValue(success());
  expect((await new MonthlyService(store,{readMonth}).query('1','2026-10')).status).toBe('ALLOWED_READABLE');expect(readMonth).toHaveBeenCalledTimes(1);
});
