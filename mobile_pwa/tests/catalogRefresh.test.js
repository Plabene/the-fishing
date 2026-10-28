import {expect,test} from 'vitest';
import {prepareCatalogRefresh} from '../scripts/lib/catalog-refresh.mjs';
const boat=(id,name=id)=>({shipId:id,uid:`sunsang24:ship:${id}`,name,port:'',province:'전라남도',local:'여수',sea:'남해권',sourceUrl:'https://example.sunsang24.com/ship/schedule_fleet',regionBasis:'public-provider-address',observedAt:'2026-10-20T00:00:00Z'});
const previous={version:'old',boats:[boat('1'),boat('2')]},sync={lastSuccessAt:'2026-10-20T00:00:00Z',schedule:'weekly'},now='2026-10-26T00:00:00Z';

test('existing fleet IDs gain a verified calendar connection and retain it across seasonally empty refreshes',()=>{
  const first=prepareCatalogRefresh(previous,[[{...boat('1'),calendarObserved:true}]],[{status:'OK'}],sync,now).next;
  expect(first.boats[0].calendarObserved).toBe(true);
  const second=prepareCatalogRefresh(first,[[{...boat('1'),calendarObserved:false}]],[{status:'OK'}],sync,now).next;
  expect(second.boats[0].calendarObserved).toBe(true);expect(second.boats[0].uid).toBe(previous.boats[0].uid);
});
test('total failure retains the catalog and last success; records failure timestamp and missing IDs',()=>{
  const before=JSON.stringify(previous),result=prepareCatalogRefresh(previous,[],[{host:'example',status:'UNAVAILABLE'}],sync,now);
  expect(result.next).toBeNull();expect(result.report).toMatchObject({status:'FAILED',lastAttemptAt:now,lastSuccessAt:sync.lastSuccessAt,added:0,changed:0,total:2,retained:2,failedSources:1,missingShipIds:['1','2']});expect(JSON.stringify(previous)).toBe(before);
});
test('verified same-ID rename and new boats update; absent boats are retained; raw rows differ from unique IDs',()=>{
  const renamed={...boat('1','새 선박명'),port:'확인한 항구',observedAt:now},newBoat=boat('3');
  const {next,report}=prepareCatalogRefresh(previous,[[renamed,newBoat],[renamed]],[{status:'OK'},{status:'UNAVAILABLE'}],sync,now);
  expect(next.boats.map(b=>b.name)).toEqual(['새 선박명','2','3']);expect(next.boats[0].uid).toBe(previous.boats[0].uid);
  expect(report).toMatchObject({status:'PARTIAL',rawItems:3,observedUnique:2,total:3,added:1,changed:1,retained:1,missingShipIds:['2']});expect(next.catalog.complete).toBe(false);
});
test('conflicting provider identities do not overwrite an existing ship or fabricate a new one',()=>{
  const {next,report}=prepareCatalogRefresh(previous,[[boat('1','가호'),boat('3','새호')],[boat('1','나호'),boat('3','다른호')]],[{status:'OK'}],sync,now);
  expect(next.boats).toEqual(previous.boats);expect(report.conflicts).toBe(2);expect(report.status).toBe('PARTIAL');expect(report.changed).toBe(0);expect(report.added).toBe(0);
});
