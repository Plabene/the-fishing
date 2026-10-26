import {expect,test} from 'vitest';
import {collectCatalogPages,collectRegionalCatalog,CATALOG_URL} from '../scripts/lib/catalog.mjs';
import {parsePublicFleet,mergePublicFleet,validatePublicFleet} from '../scripts/lib/public-fleet.mjs';
import publicCatalog from '../src/data/sunsang24Fleet.json';
import publicRoutes from '../src/data/sunsang24PublicRoutes.json';
import publicSources from '../src/data/sunsang24CatalogSources.json';
const boat=id=>({uid:id,name:id,port:'',url:CATALOG_URL+'?uid='+id});
test('regional partitions recover boats missed by the national page, including empty regions',async()=>{
  const calls=[];const result=await collectRegionalCatalog(async(page,area)=>{calls.push([page,area]);return area==='7'?{total:1,lastPage:1,boats:[boat('2')]}:area==='8'?{total:0,lastPage:1,boats:[]}:{total:1,lastPage:1,boats:[boat('1')],areas:[{id:'7',label:'군산'},{id:'8',label:'다른지역'}]};});
  expect(result.boats.map(b=>b.uid)).toEqual(['1','2']);expect(result.regionalAdded).toBe(1);expect(calls).toEqual([[1,''],[1,'7'],[1,'8']]);
});
test('repeated or missing pages reject the entire new snapshot',async()=>{
  await expect(collectCatalogPages(async()=>({total:4,lastPage:2,boats:[boat('1'),boat('2')]}))).rejects.toThrow('반복');
  await expect(collectRegionalCatalog(async(page,area)=>{if(area) throw new Error('timeout');return {total:1,lastPage:1,boats:[boat('1')],areas:[{id:'7',label:'군산'}]};})).rejects.toThrow('timeout');
});
const source={host:'example.sunsang24.com',province:'전북특별자치도',local:'군산',sea:'서해권',locationToken:'군산시',portByShip:{'1':'비응항'}};
const html=`<div class="month_nav">2026년 10월</div><div class="col-xs-6">오시는길 : 전북 군산시</div><input name="host_ship_no" value="9"><button class="btn-schedule-ship" data-ship-list-no="9">출조점</button><button class="btn-schedule-ship" data-ship-list-no="1">시험호</button><button class="btn-schedule-ship" data-ship-list-no="2">겨울호</button><table class="ship_unit ship_unit_ship_no_1"><td class="ship_info"><div class="title">시험호<p class="vtt">(일정-1)</p></div></td><td class="editor_memo_pc">비응항 승선 · private memo</td><td class="people">customer private</td></table>`;
test('public directory includes non-scheduled navigation boats without copying customer/seat data or operator rows',()=>{
  const rows=parsePublicFleet(html,source,'2026-10-26T00:00:00Z');expect(rows.map(b=>b.shipId)).toEqual(['1','2']);expect(rows[0].port).toBe('비응항');expect(rows[1].port).toBe('');expect(rows[1].calendarObserved).toBe(false);
  expect(JSON.stringify(rows)).not.toMatch(/private|customer|remaining/);expect(()=>parsePublicFleet(html,{...source,locationToken:'통영시'},'')).toThrow('주소');
  expect(()=>parsePublicFleet(html.replace('data-ship-list-no="2">겨울호','data-ship-list-no="1">다른호'),source,'')).toThrow('충돌');
  const copied='<div class="editor_memo_pc"><div class="col-xs-6">오시는길 : 예전주소</div><button class="btn-schedule-ship" data-ship-list-no="777">복사된 과거 선박</button></div>';
  expect(parsePublicFleet(copied+html,source,'2026-10-26T00:00:00Z')).toEqual(rows);
});
test('merging partial public sources preserves old IDs/aliases and records conflicting names',()=>{
  const old=[{shipId:'1',uid:'external:old',name:'시험호',port:'',province:'전북',local:'군산',url:'https://example.sunsang24.com/ship/schedule_fleet'},{shipId:'3',uid:'sunsang24:ship:3',name:'보관호'}];
  const rows=parsePublicFleet(html,source,'2026-10-26T00:00:00Z'),merged=mergePublicFleet(old,[rows]);expect(merged.boats).toHaveLength(3);expect(merged.boats[0].uid).toBe('external:old');expect(merged.boats[0].province).toBe('전북');
  expect(mergePublicFleet(old,[[{...rows[0],name:'다른호'}]]).conflicts).toHaveLength(1);expect(old[0].port).toBe('');
});

test('reviewed notice, meal and partner navigation IDs are excluded even when they have calendar cards',()=>{
  const observedAt=new Date().toISOString(),excluded={...source,excludeShipIds:['1']};
  expect(parsePublicFleet(html,excluded,observedAt).map(b=>b.shipId)).toEqual(['2']);
  expect(()=>validatePublicFleet({status:'OK',host:source.host,observedAt,boats:parsePublicFleet(html,source,observedAt)},excluded)).toThrow('선박이 아닌');
});
test('metadata API publication rejects stale/wrong-host/wrong-region/duplicate rows and strips unknown fields',()=>{
  const observedAt=new Date().toISOString(),boats=parsePublicFleet(html,source,observedAt),value={status:'OK',host:source.host,observedAt,boats:boats.map(b=>({...b,phone:'private'}))};
  expect(JSON.stringify(validatePublicFleet(value,source))).not.toContain('private');
  for(const bad of [{...value,host:'evil.sunsang24.com'},{...value,observedAt:'2020-01-01T00:00:00Z'},{...value,boats:[...boats,boats[0]]},{...value,boats:[{...boats[0],province:'경남'}]}]) expect(()=>validatePublicFleet(bad,source)).toThrow();
});

test('published source counts, live route IDs and unique fleet identities agree without non-vessel entries',()=>{
  const ids=new Set(publicCatalog.boats.map(b=>b.shipId)),observed=new Set();
  expect(ids.size).toBe(publicCatalog.boats.length);
  for(const report of publicCatalog.catalog.sources.filter(s=>s.status==='OK')) {
    expect(report.listed).toBe(report.shipIds.length);
    for(const id of report.shipIds) {expect(ids.has(id)).toBe(true);observed.add(id);}
  }
  expect(publicCatalog.catalog.listed).toBe(observed.size);
  expect(publicCatalog.catalog.retained+observed.size).toBe(ids.size);
  for(const route of publicRoutes.routes) for(const id of route.ships) expect(ids.has(id)).toBe(true);
  for(const source of publicSources.sources) for(const id of source.excludeShipIds || []) expect(ids.has(id)).toBe(false);
});
