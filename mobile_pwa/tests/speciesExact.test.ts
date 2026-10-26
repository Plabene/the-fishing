// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import captured from './fixtures/species-real-20261026.json';
import {emptyState,type Observation} from '../src/models';
import {speciesKey,eventSpecies,matchesSpecies,displayedSpecies,tripDescription,speciesBadge} from '../src/species';
import {renderSpeciesFilter} from '../src/speciesFilter';
import {defaultFleet} from '../src/defaultFleet';
import {queryMonth} from '../src/monthlyQuery';
import {validateApiResult} from '../src/providers/thefishingApi';
import {applyLiveResults} from '../src/liveQuery';
import {importData,exportData} from '../src/importLegacy';
import {parsePublicMonth} from '../availability_api/sunsang24Public';

const events=captured.events as Observation[],flower=events[0],now=Date.parse(events[1].observedAt!);
const q={month:'2026-11',requiredPeople:1,tier:'all' as const,search:'',matchingOnly:false};
function sample() {
  const state=emptyState();state.month=q.month;state.events=structuredClone(events);
  state.boats=defaultFleet().boats.filter(b=>events.some(e=>e.uid===b.uid));state.selectedUids=state.boats.map(b=>b.uid);return state;
}
afterEach(()=>vi.restoreAllMocks());

test('captured flower ship 312, November 6 is excluded by both single choices and included by the exact mixed set',()=>{
  const state=sample(),before=JSON.stringify(state.events);
  expect(flower).toMatchObject({uid:'sunsang24:ship:312',date:'2026-11-06',trip:'주꾸미,갑오징어'});
  expect(captured.sources[0].sample?.fishText).toBe(flower.trip);
  for(const [selection,ids] of [[['갑오징어'],[events[1].id]],[['쭈꾸미'],[events[2].id]],[['주꾸미','갑오징어'],[flower.id]],[['갑오징어','문어'],[]]] as [string[],string[]][]) {
    expect(queryMonth(state,{...q,species:selection},now).events.map(e=>e.id)).toEqual(ids);
  }
  expect(queryMonth(state,{...q,month:'2026-12',species:['갑오징어']},now).events).toHaveLength(0);
  expect(JSON.stringify(state.events)).toBe(before);
  expect(displayedSpecies(flower)).toBe('주꾸미+갑오징어');
  expect(speciesBadge(flower).textContent).toBe('어종 · 쭈꾸미ㆍ갑오징어');
  expect(tripDescription(flower).textContent).toBe(flower.trip);
});

test('captured responses retain all source fish through client validation, live application and backup round trip',()=>{
  vi.spyOn(Date,'now').mockReturnValue(now);
  const state=sample();state.events=[];state.tiers.tier1=[flower.uid];state.selectedSpecies=['주꾸미','갑오징어'];
  const rows=state.boats.map(boat=>{
    const list=events.filter(e=>e.uid===boat.uid);
    return {boat,result:validateApiResult({status:'ALLOWED_READABLE',events:list,observedAt:list[0].observedAt,fresh:true,cached:false},boat,q.month)};
  });
  const live=applyLiveResults(state,q.month,rows),restored=importData(JSON.parse(exportData(live))).state;
  for(const source of events) expect(restored.events.find(e=>e.id===source.id)).toMatchObject({uid:source.uid,date:source.date,trip:source.trip,speciesKey:eventSpecies(source),remaining:source.remaining,price:source.price});
  expect(restored.tiers).toEqual(state.tiers);expect(restored.selectedSpecies).toEqual(state.selectedSpecies);
  expect(queryMonth(restored,{...q,species:['갑오징어']},now).events.map(e=>e.id)).toEqual([events[1].id]);
});

test('public DOM parser preserves the captured fish field; unknown list members never become a single target',()=>{
  // Minimal DOM fixture built from captured public identity/fish fields; this is not an archived full page.
  const sample=captured.sources[0].sample!;
  const html=`<div class="month_nav">2026년 11월</div><table class="ship_unit ship_unit_ship_no_${sample.ship}"><tr><td class="ship_info"><div class="title">오천항 꽃돼지호</div><button class="btn_user_reservation" data-schedule_no="${sample.schedule}" data-ship_status_code="ING"></button></td><td><div class="reservation_detail" data-sdate="${sample.date}" data-schedule_no="${sample.schedule}"><div class="fishspecies">${sample.fishHtml}</div></div></td><td class="ship_info2"><div class="remain">남은자리 ${flower.remaining}명</div></td></tr></table>`;
  const parsed=parsePublicMonth(html,'pigho.sunsang24.com',q.month,flower.observedAt!).events[0];
  expect(parsed).toMatchObject({id:flower.id,uid:flower.uid,date:flower.date,trip:flower.trip,speciesKey:flower.speciesKey});
  const unknown=parsePublicMonth(html.replace(sample.fishText,'갑오징어,미등록어종'),'pigho.sunsang24.com',q.month,flower.observedAt!).events[0];
  expect(unknown.trip).toBe('갑오징어,미등록어종');expect(unknown.speciesKey).toBe('unknown');expect(matchesSpecies(unknown.speciesKey!,['갑오징어'])).toBe(false);
});

test.each([
  ['쭈꾸미, 주꾸미','주꾸미'],['갑오징어,문어','갑오징어+문어'],['갑오징어,방어','갑오징어+방어'],
  ['갑오징어,오징어','갑오징어+오징어'],['무늬오징어,갑오징어','갑오징어+무늬오징어'],
  ['참우럭,우럭','우럭+참우럭'],['화살촉오징어','화살촉오징어'],['황열기','황열기'],
  ['갑오징어,신규어종','unknown'],['갑오징어+미확인','unknown'],['갑오징어 외 2종','unknown'],
  ['갑오징어 등','unknown'],['갑오징어 / 어종 미정','unknown'],['갑오징어,잡어','unknown'],
  ['출조 정보 미표시','unknown'],['','unknown'],
])('normalization retains distinct fish or marks ambiguity: %s', (raw,expected)=>{
  expect(speciesKey(raw)).toBe(expected);expect(speciesKey(speciesKey(raw))).toBe(expected);
  if(expected==='unknown') expect(matchesSpecies(speciesKey(raw),['갑오징어'])).toBe(false);
});

test('same-name same-date cross-platform fixtures remain separate, even when schedule IDs collide',()=>{
  // Synthetic duplicate scenario; no claim that these two real providers share this trip.
  const state=sample(),sunBoat=state.boats.find(b=>b.uid===flower.uid)!,tfBoat=state.boats.find(b=>b.uid==='1441')!;
  state.boats=state.boats.map(b=>({...b,name:'동명 시험호',port:'동일 시험항'}));
  const tf={...events[1],id:flower.id,date:flower.date},sun={...flower};
  const result=(event:Observation)=>({status:'ALLOWED_READABLE' as const,events:[event],observedAt:event.observedAt!,message:'test'});
  const live=applyLiveResults(state,q.month,[{boat:sunBoat,result:result(sun)},{boat:tfBoat,result:result(tf)}]);
  const restored=importData(JSON.parse(exportData(live))).state;
  expect(restored.events).toHaveLength(2);
  expect(queryMonth(restored,{...q,species:['갑오징어']},now).events.map(e=>e.uid)).toEqual(['1441']);
  expect(queryMonth(restored,{...q,species:['주꾸미','갑오징어']},now).events.map(e=>e.uid)).toEqual([flower.uid]);
  expect(restored.events.find(e=>e.uid===flower.uid)?.trip).toBe(flower.trip);
});

test('checkbox counts show single trips; combination count follows current availability/search constraints and exclusions',()=>{
  const target=document.createElement('div'),counts=new Map([['주꾸미+갑오징어',5],['갑오징어',2]]),matches=new Map([['주꾸미+갑오징어',1],['갑오징어',1]]);
  renderSpeciesFilter(target,counts,['갑오징어'],[],()=>{},'',matches);
  expect(target.querySelector('[data-species-choice="갑오징어"]')?.parentElement?.textContent).toBe('갑오징어단독 1건');
  expect(target.querySelector('[data-species-choice="주꾸미"]')?.parentElement?.textContent).toBe('주꾸미단독 0건');
  expect(target.querySelector('#species-selection-summary')?.textContent).toContain('같은 어종 조합 1건');
  renderSpeciesFilter(target,counts,['주꾸미','갑오징어'],['주꾸미+갑오징어'],()=>{},'',matches);
  expect(target.querySelector('#species-selection-summary')?.textContent).toContain('같은 어종 조합 0건');
});
