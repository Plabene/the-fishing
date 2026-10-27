import {expect,test,vi} from 'vitest';
import {collectMonth,createLivePreview,applyLiveResults,type LiveRow} from '../src/liveQuery';
import {emptyState,type Boat} from '../src/models';
import type {ProviderResult} from '../src/provider';
import {boatPlatform} from '../src/platforms';

const boat=(uid:string):Boat=>({uid,name:uid,port:'시험항',url:''});
const success=():ProviderResult=>({status:'ALLOWED_READABLE',fresh:true,cached:false,events:[],observedAt:new Date().toISOString(),message:'ok'});
test('independent platform pools keep three slots each, count aliases in TheFishing and retain exact selection order',async()=>{
  const boats=['1','2','3','4','external:test','sunsang24:ship:900001','sunsang24:ship:900002','sunsang24:ship:900003','sunsang24:ship:900004'].map(boat);
  const release=new Map<string,(value:ProviderResult)=>void>(),starts:string[]=[],active={tf:0,sun:0},peak={tf:0,sun:0};
  const pool=(b:Boat)=>boatPlatform(b)==='sunsang24'?'sun':'tf';
  const readMonth=vi.fn((b:Boat)=>{starts.push(b.uid);const key=pool(b);peak[key]=Math.max(peak[key],++active[key]);return new Promise<ProviderResult>(resolve=>release.set(b.uid,value=>{active[key]--;resolve(value);}));});
  const pending=collectMonth({readMonth},[...boats,boats[0]],'2026-11',new AbortController().signal,()=>{},{perPlatform:99});
  expect(readMonth).toHaveBeenCalledTimes(6);expect(peak).toEqual({tf:3,sun:3});
  release.get('sunsang24:ship:900001')!(success());await vi.waitFor(()=>expect(starts).toContain('sunsang24:ship:900004'));
  // No TheFishing response is required to complete the whole Sunsang24 pool.
  for(const b of boats.filter(b=>pool(b)==='sun').slice(1)) release.get(b.uid)!(success());
  release.get('1')!(success());await vi.waitFor(()=>expect(starts).toContain('external:test'));release.get('external:test')!(success());
  await vi.waitFor(()=>expect(starts).toContain('4'));for(const id of ['2','3','4']) release.get(id)!(success());
  const result=await pending;expect(result.rows.map(row=>row.boat.uid)).toEqual(boats.map(b=>b.uid));expect(result.total).toBe(boats.length);expect(peak).toEqual({tf:3,sun:3});
});
test('a blocked platform stops only its queued boats; cancellation stops both pools without inventing results',async()=>{
  const boats=['1','2','sunsang24:ship:900001','sunsang24:ship:900002'].map(boat);
  const starts:string[]=[];
  const result=await collectMonth({readMonth:async b=>{starts.push(b.uid);return boatPlatform(b)==='sunsang24'?success():{status:'ACCESS_RESTRICTED',stop:true,events:[],message:'403'};}},boats,'2026-11',new AbortController().signal,()=>{},{perPlatform:1});
  expect(starts).not.toContain('2');expect(result.rows.map(r=>r.boat.uid)).toEqual(['1',boats[2].uid,boats[3].uid]);expect(result.stopped).toBe(true);
  const controller=new AbortController(),readMonth=vi.fn(async(_b:Boat,_m:string,signal:AbortSignal)=>new Promise<ProviderResult>((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true})));
  const pending=collectMonth({readMonth},boats,'2026-11',controller.signal,()=>{},{perPlatform:1});controller.abort();
  const cancelled=await pending;expect(readMonth).toHaveBeenCalledTimes(2);expect(cancelled.rows).toEqual([]);expect(cancelled.cancelled).toBe(true);
});
test('query-local previews match final merges without changing tiers, backups or earlier saved seats',()=>{
  const original=emptyState();original.month='2026-11';original.boats=['1','2','3'].map(boat);original.tiers.tier1=['1'];original.tiers.other=['2'];original.selectedUids=['1','2'];original.fleetBaseline=structuredClone(original.boats);
  const now=new Date().toISOString();original.events=[{id:'old',uid:'1',date:'2026-11-06',trip:'쭈꾸미, 갑오징어',port:'시험항',departure:'05:00',remaining:9,verified:true,observedAt:now,source:'api'}];original.monthChecks=[{uid:'2',month:original.month,observedAt:now,requiredPeople:1,source:'api'}];
  const before=structuredClone(original),rows:LiveRow[]=[
    {boat:original.boats[0],result:{...success(),events:[{...original.events[0],remaining:2}]}},
    {boat:original.boats[1],result:{status:'TIMEOUT',message:'미확인',events:[],stop:true}},
    {boat:original.boats[2],result:success()},
  ];
  vi.useFakeTimers();vi.setSystemTime(new Date(now));
  try {const preview=createLivePreview(original,original.month);preview.append(rows.slice(0,1));const rendered=preview.append(rows.slice(1));expect(rendered).toEqual(applyLiveResults(original,original.month,rows));expect(original).toEqual(before);expect(rendered.events[0].remaining).toBe(2);expect(original.events[0].remaining).toBe(9);expect(original.monthChecks[0].source).toBe('api');expect(rendered.monthChecks?.find(c=>c.uid==='2')?.source).toBeUndefined();
    const next=createLivePreview(original,original.month);expect(next.append([])).toEqual(original);expect(next.append([])).not.toBe(rendered);
  } finally {vi.useRealTimers();}
});
