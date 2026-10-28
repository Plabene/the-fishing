import {expect,test} from 'vitest';
import captured from './fixtures/south-public-month.json';
import unpublished from './fixtures/unpublished-public-days.json';
import {parsePublicMonth} from '../availability_api/sunsang24Public';
import {Sunsang24PublicApi} from '../src/providers/sunsang24PublicApi';
import {defaultFleet,initializeFleet} from '../src/defaultFleet';
import {uniqueFleet,supportsLive} from '../src/fleetList';
import {boatPlatform,sunsangListing} from '../src/platforms';
import {commonRegion,matchesRegion} from '../src/regions';
import {publicRouteForBoat} from '../src/sunsang24PublicRoutes';
import {applyLiveResults} from '../src/liveQuery';
import {freshQueryView} from '../src/freshResults';
import {queryMonth} from '../src/monthlyQuery';
import {calendarStatus} from '../src/calendarStatus';
import {mergePublicFleet} from '../scripts/lib/public-fleet.mjs';

test.each(captured)('$host $month observed source DOM reaches the correct vessel and calendar date',async sample=>{
  const state=defaultFleet(),uid=`sunsang24:ship:${sample.shipId}`,boat=state.boats.find(b=>b.uid===uid)!;
  expect(boat).toBeDefined();expect(commonRegion(boat).sea).toBe('남해권');expect(supportsLive(boat)).toBe(true);
  const result=parsePublicMonth(sample.html,sample.host,sample.month,new Date().toISOString());
  expect(result.events.length).toBe(2);expect(result.events.every(e=>e.uid===uid && e.date.startsWith(sample.month))).toBe(true);
  const client=new Sunsang24PublicApi('https://fishing.example.workers.dev',async()=>Response.json(result));
  const response=await client.readMonth(boat,sample.month,new AbortController().signal);
  expect(response.status).toBe('ALLOWED_READABLE');expect(response.events.map(e=>e.trip)).toEqual(result.events.map(e=>e.trip));
  state.month=sample.month;state.boats=[boat];state.selectedUids=[uid];state.tiers={tier1:[uid],tier2:[],tier3:[],other:[]};state.requiredPeople=1;state.selectedRegion=undefined;
  const rows=[{boat,result:response}],saved=applyLiveResults(state,sample.month,rows),live=freshQueryView(saved,sample.month,rows);
  const queried=queryMonth(live,{month:sample.month,requiredPeople:1,tier:'all',search:'',matchingOnly:false,species:'all'});
  expect(queried.events.length).toBe(response.events.length);
  for(const event of response.events) if(event.reservationStatus==='available' && event.remaining!>0) expect(calendarStatus(live,queried,event.date).kind).toBe('available');
  expect(freshQueryView({...saved,month:'2027-01'},sample.month,rows).events).toEqual([]);
  const failed=[{boat,result:{status:'TIMEOUT' as const,events:[],message:'timeout'}}];
  expect(freshQueryView(applyLiveResults(saved,sample.month,failed),sample.month,failed).events).toEqual([]);
  expect(saved.events.length).toBe(2); // Retained history never becomes a fresh seat after failure.
});

test('all registered identities survive regional partitioning and catalogue refresh without tier changes',()=>{
  const state=defaultFleet(),fleet=uniqueFleet(state.boats),seen=new Set<string>();
  expect(fleet).toHaveLength(state.boats.length);
  for(const sea of new Set(fleet.map(b=>commonRegion(b).sea))) for(const b of fleet.filter(b=>matchesRegion(b,sea?{sea}:{}))) {
    if(commonRegion(b).sea!==sea) continue;expect(seen.has(b.uid)).toBe(false);seen.add(b.uid);
    if(boatPlatform(b)==='sunsang24') {const listing=sunsangListing(b.uid);expect(listing).toBeDefined();if(supportsLive(b)) expect(publicRouteForBoat(b.uid)?.ships).toContain(listing!.shipId);}
  }
  expect(seen.size).toBe(fleet.length);
  const before=JSON.stringify(state.tiers);expect(JSON.stringify(initializeFleet(state).state.tiers)).toBe(before);
});

test('same names at different ports and platform IDs never merge or transfer a booking connection',()=>{
  const rows=[{shipId:'1',uid:'sunsang24:ship:1',name:'동명호',port:'여수항',sourceUrl:'https://chf.sunsang24.com/ship/schedule_fleet'},{shipId:'2',uid:'sunsang24:ship:2',name:'동명호',port:'녹동항',sourceUrl:'https://blackdragon.sunsang24.com/ship/schedule_fleet'}];
  expect(mergePublicFleet(rows as never,[]).boats).toHaveLength(2);
  expect(publicRouteForBoat('sunsang24:ship:9999999')).toBeUndefined();
});

test.each(unpublished)('$host real schedule_no=0 placeholders do not invalidate the real monthly trip',sample=>{
  const result=parsePublicMonth(sample.html,sample.host,sample.month,new Date().toISOString());
  expect(result.status).toBe('ALLOWED_READABLE');expect(result.events).toHaveLength(1);
  expect(result.unpublishedDates).toHaveLength(2);expect(result.events[0].id).not.toBe('sunsang24-schedule-0');
  expect(result.events.every(e=>!result.unpublishedDates?.some(d=>d.date===e.date && `sunsang24:ship:${d.shipId}`===e.uid))).toBe(true);
  // A zero identifier with an asserted seat count is ambiguous and must fail closed.
  expect(()=>parsePublicMonth(sample.html.replace('<span class="shipping_status" data-status_code=""></span>','남은자리 20명'),sample.host,sample.month,new Date().toISOString())).toThrow();
});
