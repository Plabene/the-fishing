import {readFileSync} from 'node:fs';
import {expect,test,vi} from 'vitest';
import {parsePublicMonth} from '../availability_api/sunsang24Public';
import {Sunsang24PublicApi} from '../src/providers/sunsang24PublicApi';
import {defaultFleet} from '../src/defaultFleet';
import {publicRouteForBoat} from '../src/sunsang24PublicRoutes';
import {auditCalendar} from '../src/calendarAudit';
import {discoverPublicHosts,publicCandidateHost} from '../scripts/lib/public-discovery.mjs';

// Actual 2026-10-28 DOM, stripped to public schedule identity/status/species fields.
// Historical seats in this fixture are test data, never a live availability source.
const html=readFileSync(new URL('./fixtures/oceanstar-202611.html',import.meta.url),'utf8');
const host='ysoceanstar.sunsang24.com',month='2026-11';
const boat=(id:string)=>defaultFleet().boats.find(b=>b.uid===`sunsang24:ship:${id}`)!;
test('observed Oceanstar 1/2/3 IDs retain 30 separate dates each through API, storage and calendar',async()=>{
 const source=parsePublicMonth(html,host,month,new Date().toISOString());
 expect(source.events).toHaveLength(90);
 const request=vi.fn<typeof fetch>(async()=>Response.json(source)),provider=new Sunsang24PublicApi('https://fishing.example.workers.dev',request);
 for(const id of ['602','769','681']) {
  expect(publicRouteForBoat(boat(id).uid)?.host).toBe(host);
  const client=await provider.readMonth(boat(id),month,new AbortController().signal);
  expect(client.events).toHaveLength(30);expect(new Set(client.events.map(e=>e.date)).size).toBe(30);
  expect(client.events.every(e=>e.uid===boat(id).uid && e.date.startsWith(month))).toBe(true);
  expect(auditCalendar(boat(id),month,source,client)).toMatchObject({classification:'NORMAL_CALENDAR',sourceEvents:30,calendarEvents:30,missingIds:[],extraIds:[]});
 }
 expect(request).toHaveBeenCalledTimes(1);
 const closed=source.events.find(e=>e.uid===boat('769').uid && e.date==='2026-11-01')!;
 expect(closed).toMatchObject({reservationStatus:'closed',remaining:null});
 expect(source.events.some(e=>e.uid===boat('769').uid && e.reservationStatus==='available' && e.remaining!>0)).toBe(true);
});
test('audit detects dropped rows and stale results instead of counting HTTP success as calendar success',async()=>{
 const source=parsePublicMonth(html,host,month,new Date().toISOString()),client={...source,events:source.events.filter(e=>e.uid===boat('769').uid)};
 expect(auditCalendar(boat('769'),month,source,{...client,events:client.events.slice(1)})).toMatchObject({classification:'CALENDAR_MISMATCH',sourceEvents:30,calendarEvents:29});
 expect(auditCalendar(boat('769'),month,source,{...client,cached:true})).toMatchObject({classification:'CALENDAR_MISMATCH',calendarEvents:0});
 expect(auditCalendar(boat('769'),month,source,{...client,status:'UNVERIFIED',events:[]})).toMatchObject({classification:'SOURCE_FAILED'});
 expect(auditCalendar(boat('769'),month,{...source,events:[]},{...client,events:[]})).toMatchObject({classification:'NO_PUBLISHED_SCHEDULE',calendarEvents:0});
});
test('discovery deduplicates only public fleet homepage candidates and never authorizes them',()=>{
 const links=['https://newboat.sunsang24.com/','https://newboat.sunsang24.com/ship/schedule_fleet/202611','https://api.sunsang24.com/','https://www.sunsang24.com/ship/list','https://evil.example/','https://user:password@other.sunsang24.com/','http://plain.sunsang24.com/','javascript:alert(1)','https://private.sunsang24.com/customer/account','https://sibling.sunsang24.com/ship/info'];
 expect(discoverPublicHosts(links.map(h=>`<a href="${h}">선사</a>`).join(''),host)).toEqual(['newboat.sunsang24.com','sibling.sunsang24.com']);
 expect(publicCandidateHost('https://newboat.sunsang24.com:444/')).toBeNull();
 expect(publicRouteForBoat('sunsang24:ship:99999999')).toBeUndefined();
});
