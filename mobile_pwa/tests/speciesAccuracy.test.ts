// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { speciesKey, eventSpecies, MIXED_SPECIES } from '../src/species';
import { emptyState } from '../src/models';
import { importData } from '../src/importLegacy';
import { queryMonth } from '../src/monthlyQuery';
import { validateApiResult } from '../src/providers/thefishingApi';
import archive from '../src/data/monthlyArchive.json';

// Public trip names observed in the PC archive and the live October calendar.
test.each([
  ['쭈/갑 (중식 미제공)',MIXED_SPECIES],['쭈.갑오징어낚시',MIXED_SPECIES],
  ['쭈갑낚시출조',MIXED_SPECIES],['쭈갑전투',MIXED_SPECIES],['갑쭈',MIXED_SPECIES],
  ['주갑',MIXED_SPECIES],['매주 갑오징어 출조','갑오징어'],['갑오징어 주 3회 출조','갑오징어'],
  ['쭈꾸미&갑이',MIXED_SPECIES],['쭈꾸미&갑이(이벤트출조)',MIXED_SPECIES],
  ['▶쭈꾸미(쭈/갑)◀',MIXED_SPECIES],['쭈꾸미(쭈&갑)출조합니다~~♡♡',MIXED_SPECIES],
  ['쭈구미출조','주꾸미'],['봄 쭈꾸미(알쭈)','주꾸미'],
  ['☆☆☆ 갑 오징어 ☆☆☆13인 이상 첫 예약자 승선지 자리 추첨','갑오징어'],
  ['꽃게 낚시','꽃게'],['백조기 낚시','백조기'],['무늬오징어','무늬오징어'],
  ['광어/우럭/농어 외수질+ 다운샷(생새우포함)','광어+농어+우럭'],
  ['왕쭈꾸미+우럭병행 출조(모든미끼포함)','우럭+주꾸미'],
  ['광어 쭈갑 병행','갑오징어+광어+주꾸미'],
  ['다운샷','unknown'],['생새우 외수질(새우미끼 포함)','unknown'],
  ['뉴찬스호정규대회이벤트출조(생새우포함)','unknown'],['(탐사출초)','unknown'],
])('species accuracy for actual trip %s', (trip,expected)=>expect(speciesKey(trip)).toBe(expected));

test('raw trip takes precedence over stale derived species, without borrowing fish for unnamed trips',()=>{
  expect(eventSpecies({trip:'쭈꾸미&갑이',speciesKey:'주꾸미',species:'주꾸미'})).toBe(MIXED_SPECIES);
  expect(eventSpecies({trip:'쭈/갑 (중식 미제공)',speciesKey:'쭈갑중식미제공'})).toBe(MIXED_SPECIES);
  expect(eventSpecies({trip:'문어',speciesKey:'갑오징어'})).toBe('문어');
  expect(eventSpecies({trip:'다운샷',speciesKey:'광어'})).toBe('unknown');
  expect(eventSpecies({trip:'',speciesKey:'갑오징어'})).toBe('unknown');
  expect(eventSpecies({trip:'기본 출조',speciesKey:'unknown',species:'문어'})).toBe('unknown');
});

const boat={uid:'563',name:'워너비호 막내선장',port:'',url:'https://thefishing.kr/reservation/list.php?uid=563'};
test('API reclassifies old cached labels but keeps date, price, remaining and freshness',()=>{
  const observedAt=new Date().toISOString();
  const row={id:'direct-123456789012345678901234',uid:boat.uid,date:'2026-10-26',trip:'쭈/갑 (중식 미제공)',speciesKey:'쭈갑중식미제공',species:'쭈갑중식미제공',remaining:12,price:90000,departure:'05:00',observedAt};
  const result=validateApiResult({status:'ALLOWED_READABLE',observedAt,cached:true,events:[row]},boat,'2026-10');
  expect(result.events[0]).toMatchObject({...row,speciesKey:MIXED_SPECIES,species:'쭈꾸미ㆍ갑오징어'});
});

test('archive species migration corrects actual compound trips and keeps every original observation',()=>{
  const state=emptyState();state.boats=[boat];state.selectedUids=[boat.uid];
  const restored=importData({...state,events:archive.events}).state;
  expect(restored.events).toHaveLength(archive.events.length);
  const {trip,uid,date,remaining,price,observedAt}=archive.events[0];
  expect(restored.events[0]).toMatchObject({trip,uid,date,remaining,price,observedAt});
  for(const event of restored.events.filter(e=>/쭈\/갑|쭈\.갑|갑이/.test(e.trip))) expect(event.speciesKey).toBe(MIXED_SPECIES);
  expect(restored.events.find(e=>e.trip==='쭈구미출조')?.speciesKey).toBe('주꾸미');
  const q={month:'2026-10',requiredPeople:1,tier:'all' as const,search:'',matchingOnly:false};
  const expected=restored.events.filter(e=>e.uid===boat.uid && /쭈\/갑/.test(e.trip));
  expect(expected.length).toBeGreaterThan(0);
  expect(queryMonth(restored,{...q,species:'갑오징어'}).events).toHaveLength(0);
  expect(queryMonth(restored,{...q,species:['갑오징어','주꾸미']}).events).toEqual(expected);
});

test('obsolete method filters do not accidentally select or exclude all unknown species',()=>{
  const state=emptyState();state.selectedSpecies='다운샷';state.excludedSpeciesKeys=['다운샷','쭈갑전투'];
  const restored=importData(state).state;
  expect(restored.selectedSpecies).toBe('all');expect(restored.excludedSpeciesKeys).toEqual([MIXED_SPECIES]);
  state.selectedSpecies='기타/미확인';state.excludedSpeciesKeys=['unknown'];
  expect(importData(state).state.selectedSpecies).toEqual(['unknown']);expect(importData(state).state.excludedSpeciesKeys).toEqual(['unknown']);
});
