// @vitest-environment jsdom
import {expect,test} from 'vitest';
import catalog from '../src/data/sunsang24Fleet.json';
import original from '../src/data/defaultFleet.json';
import {defaultFleet,initializeFleet} from '../src/defaultFleet';
import {emptyState,reservationLink,type Boat} from '../src/models';
import {commonRegion,matchesRegion,locationDescription,migrateRegionFilter,emptyRegion,UNKNOWN_REGION} from '../src/regions';
import {boatPlatform,sunsangListing,duplicateCandidates,sunsangDateLink} from '../src/platforms';
import {queryMonth} from '../src/monthlyQuery';
import {exportData,importData} from '../src/importLegacy';
import {renderDay} from '../src/dayView';
import {renderMonthlyList} from '../src/monthlyView';
import {removeBoat} from '../src/tierStore';
const fleet=()=>defaultFleet().boats;
const tf=(local:string,port='',province='충청남도'):Boat=>({uid:'1',name:'동명호',port,url:'https://thefishing.kr/reservation/list.php?uid=1',region:{sea:'서해권',province,local}});

test('all public listings import exactly once, preserving four legacy IDs and no saved seats',()=>{
  const boats=fleet(),sun=boats.filter(b=>boatPlatform(b)==='sunsang24');expect(sun).toHaveLength(catalog.boats.length);expect(new Set(boats.map(b=>b.uid)).size).toBe(boats.length);
  expect(sun.filter(b=>b.uid.startsWith('external:'))).toHaveLength(4);
  expect(catalog.boats.filter(b=>b.areaId)).toHaveLength(376);expect(catalog.boats.filter(b=>b.port).length).toBeGreaterThanOrEqual(4);
  expect(defaultFleet().events).toEqual([]);
  for(const b of sun) expect(reservationLink(b.url,b.uid)).toBe(b.url);
  for(const field of ['cookie','token','password','remaining','applicant','phone','session']) expect(JSON.stringify(catalog)).not.toContain(`"${field}"`);
});
test('upgrade adds 376 listings and inherits the 21 saved PC tiers and retains personal deletion, name, tier, selection and source region',()=>{
  const state={...emptyState(),...structuredClone(original.state),schema:1 as const,fleetSeedVersion:original.version,fleetBaseline:structuredClone(original.state.boats)};
  const deleted=state.boats.at(-1)!.uid;removeBoat(state,deleted);state.boats[0].name='내 이름';const before=structuredClone(state);
  const upgraded=initializeFleet(state).state;
  expect(upgraded.boats).toHaveLength(before.boats.length+catalog.boats.filter(b=>!original.state.boats.some(old=>old.uid===b.uid)).length);expect(upgraded.boats[0].name).toBe('내 이름');expect(upgraded.boats.some(b=>b.uid===deleted)).toBe(false);
  for(const tier of ['tier1','tier2','tier3','other'] as const) expect(upgraded.tiers[tier].filter(id=>!id.startsWith('sunsang24:'))).toEqual(before.tiers[tier]);expect(upgraded.selectedUids.filter(id=>!id.startsWith('sunsang24:'))).toEqual(before.selectedUids);expect(upgraded.selectedUids.length-before.selectedUids.length).toBe(21);
  expect(initializeFleet(upgraded).state).toEqual(upgraded);
});
test('source-specific province/local aliases join regions; nearby departure labels never become ports',()=>{
  const hong=fleet().find(b=>sunsangListing(b.uid)?.shipId==='884')!;
  expect(commonRegion(hong)).toEqual({sea:'서해권',province:'충청남도',local:'홍성'});
  expect(matchesRegion(hong,{province:'충청남도',local:'홍성',port:UNKNOWN_REGION})).toBe(true);
  expect(matchesRegion(hong,{local:'보령'})).toBe(false);expect(locationDescription(hong)).toContain('보령인근');
  const sun=fleet().find(b=>sunsangListing(b.uid)?.areaId==='497')!;
  expect(matchesRegion(sun,{province:'충청남도',local:'보령'})).toBe(true);expect(commonRegion(tf('보령시','오천항'))).toEqual(commonRegion(sun));
  expect(commonRegion(tf('안면도','영목항')).local).toBe('태안');expect(commonRegion(tf('격포','격포항','전라북도')).local).toBe('부안');
});
test('Incheon source category is split by actual port; missing evidence and composite regions stay unresolved',()=>{
  expect(commonRegion(tf('인천','오이도','경기도'))).toMatchObject({province:'경기도',local:'시흥'});
  expect(commonRegion(tf('인천','연안부두','경기도'))).toMatchObject({province:'인천광역시',local:''});
  expect(commonRegion(tf('인천','','경기도')).province).toBe('');
  expect(commonRegion(tf('영흥도','영흥도 진두항','경기도'))).toMatchObject({province:'인천광역시',local:'옹진'});
  expect(commonRegion(tf('장흥,완도','','전라남도')).local).toBe('장흥,완도');
  expect(migrateRegionFilter([tf('인천','오이도','경기도'),{...tf('인천','연안부두','경기도'),uid:'2'}],{...emptyRegion(),sea:'서해권',province:'경기도',local:'인천'})).toEqual({...emptyRegion(),sea:'서해권'});
});
test('boat/date links stay in their namespace and reject unregistered hosts, mismatched ships or credentials',()=>{
  const b=fleet().find(b=>b.uid==='sunsang24:ship:698')!,link=sunsangDateLink(b.uid,'2026-10-25');expect(reservationLink(link,b.uid)).toBe(link);
  for(const url of [link.replace('698','885'),link+'&token=x',link+'&sdate=2026-10-26','https://evil.sunsang24.com/ship/schedule_fleet','https://u:p@www.sunsang24.com/ship/list?ship_no=698','javascript:alert(1)']) expect(reservationLink(url,b.uid)).toBe('');
});
test('combined results keep same-name listings and seats separate; platform, region, species and month filters compose',()=>{
  const state=emptyState(),first=tf('태안','오천항'),second={...first,uid:'sunsang24:ship:698',url:sunsangDateLink('sunsang24:ship:698','2026-10-25')};
  state.boats=[first,second];state.selectedUids=['1',second.uid];state.month='2026-10';const at=new Date().toISOString();
  state.events=state.boats.map((b,i)=>({id:String(i),uid:b.uid,date:'2026-10-25',trip:'문어',species:'문어',remaining:i+2,port:b.port,departure:'05:00',verified:true,observedAt:at,source:'api'}));
  const q={month:state.month,requiredPeople:1,tier:'all' as const,search:'동명호',matchingOnly:true};
  expect(duplicateCandidates(first,state.boats)).toEqual([second]);expect(queryMonth(state,q).events.map(e=>e.remaining)).toEqual([2,3]);
  state.selectedPlatform='sunsang24';expect(queryMonth(state,q).events.map(e=>e.uid)).toEqual([second.uid]);
  state.selectedPlatform='thefishing';expect(queryMonth(state,q).events.map(e=>e.uid)).toEqual(['1']);
  state.selectedPlatform='all';state.selectedSpecies=['주꾸미'];expect(queryMonth(state,q).events).toEqual([]);state.selectedSpecies='all';
  expect(queryMonth(state,{...q,month:'2026-11'}).events).toEqual([]);
  expect(importData(JSON.parse(exportData(state))).state.selectedPlatform).toBe('all');
});
test('calendar day and monthly list display platform tags, source status and correct date link',()=>{
  const state=emptyState(),boat=fleet().find(b=>b.uid==='sunsang24:ship:698')!;state.boats=[boat];state.selectedUids=[boat.uid];state.month='2026-10';
  state.events=[{id:'sun',uid:boat.uid,date:'2026-10-25',trip:'문어',remaining:null,port:'',departure:'',verified:true,source:'api',observedAt:new Date().toISOString(),reservationStatus:'waitlist',reservationStatusLabel:'예약대기',reservationUrl:sunsangDateLink(boat.uid,'2026-10-25')}];
  const result=queryMonth(state,{month:state.month,requiredPeople:1,tier:'all',search:'',matchingOnly:false}),day=document.createElement('div'),list=document.createElement('div');
  renderDay(day,state,'2026-10-25','all','',false,result);renderMonthlyList(list,state,result,50,()=>{},()=>{});
  for(const view of [day,list]) {expect(view.querySelector('.platform-sunsang24')?.textContent).toBe('선상24');expect(view.textContent).toContain('예약대기');expect(view.textContent).toContain('미확인');expect(view.querySelector('a')?.href).toContain('ship_no=698&sdate=2026-10-25');}
});
