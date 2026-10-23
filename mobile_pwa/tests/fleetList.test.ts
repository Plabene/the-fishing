import {expect,test} from 'vitest';
import {alphabeticFleet,boatIdentity,platformCounts,platformQueryStats,supportsLive} from '../src/fleetList';
import {defaultFleet} from '../src/defaultFleet';
import type {Boat} from '../src/models';
import type {LiveRow} from '../src/liveQuery';
import {collectMonth} from '../src/liveQuery';

test('fleet uses Korean ascending names and exact platform IDs, retaining separate cross-platform bookings',()=>{
  const base=(uid:string,name:string):Boat=>({uid,name,port:'오천항',url:''});
  const boats=[base('3','하늘호'),base('2','나래호'),base('1','가나다호'),base('sunsang24:ship:698','가나다호'),base('1','중복 수집명')];
  expect(alphabeticFleet(boats).map(b=>b.name)).toEqual(['가나다호','가나다호','나래호','하늘호']);
  expect(platformCounts(boats)).toEqual({all:4,thefishing:3,sunsang24:1});
  expect(boatIdentity(boats[2])).not.toBe(boatIdentity(boats[3]));
});
test('mixed queries start both platforms early without changing result order or increasing concurrency',async()=>{
  const boats=['1','2','3','sunsang24:ship:698','sunsang24:ship:1530'].map(uid=>({uid,name:uid,port:'',url:''})),started:string[]=[];
  let running=0,peak=0;
  const result=await collectMonth({readMonth:async boat=>{started.push(boat.uid);peak=Math.max(peak,++running);await Promise.resolve();running--;return {status:'ALLOWED_READABLE',events:[],message:''};}},boats,'2026-11',new AbortController().signal,()=>{},3);
  expect(started.slice(0,3)).toEqual(['1','sunsang24:ship:698','2']);expect(peak).toBe(3);expect(result.rows.map(r=>r.boat.uid)).toEqual(boats.map(b=>b.uid));
});
test('legacy Sunsang aliases are deduplicated by native ship ID and public support is explicit',()=>{
  const fleet=defaultFleet().boats,alias=fleet.find(b=>b.uid.startsWith('external:') && boatIdentity(b).startsWith('sunsang24:') && supportsLive(b));
  const linked=fleet.find(b=>b.uid==='sunsang24:ship:698')!;
  expect(supportsLive(linked)).toBe(true);
  expect(supportsLive({...linked,uid:'sunsang24:ship:99999999'})).toBe(false);
  expect(alias).toBeDefined();if(alias) {
    const native={...alias,uid:`sunsang24:ship:${boatIdentity(alias).split(':').at(-1)}`};
    expect(platformCounts([alias,native]).all).toBe(1);
  }
});
test('per-platform summary distinguishes successful empty calendars, missing routes, policy denial and failures',()=>{
  const boats=['1','2','sunsang24:ship:698','sunsang24:ship:99999999','sunsang24:ship:1530'].map(uid=>({uid,name:uid,port:'',url:''}));
  const rows:LiveRow[]=[
    {boat:boats[0],result:{status:'ALLOWED_READABLE',events:[],message:'정상 빈 달력'}},
    {boat:boats[1],result:{status:'HTTP_ERROR',events:[],message:'실패'}},
    {boat:boats[2],result:{status:'PERMISSION_DENIED',events:[],message:'제한'}},
    {boat:boats[3],result:{status:'UNSUPPORTED_SOURCE',events:[],message:'미연동'}}];
  expect(platformQueryStats(boats,rows)).toEqual([
    {platform:'thefishing',total:2,success:1,unlinked:0,restricted:0,failed:1,pending:0,events:0},
    {platform:'sunsang24',total:3,success:0,unlinked:1,restricted:1,failed:0,pending:1,events:0}]);
});
