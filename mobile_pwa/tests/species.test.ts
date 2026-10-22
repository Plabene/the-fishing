// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { speciesKey, speciesLabel, eventSpecies, matchesSpecies, speciesColor } from '../src/species';
import { parseCalendar } from '../src/providers/thefishingParser';
import { queryMonth } from '../src/monthlyQuery';
import { emptyState } from '../src/models';
import { importData, exportData } from '../src/importLegacy';
const boat={uid:'6130',name:'시험 선박',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=6130'};
test.each([['쭈꾸미','주꾸미'],['돌문어 출조','문어'],['쭈갑','주꾸미+갑오징어'],['쭈꾸미ㆍ갑오징어','주꾸미+갑오징어'],['갑오징어/주꾸미','주꾸미+갑오징어'],['광어 우럭 다운샷','광어+우럭'],['기타/미확인','unknown'],['기본 출조','unknown']])('PC species aliases %s -> %s',(raw,key)=>expect(speciesKey(raw)).toBe(key));
test('PC mixed species label and saved colors remain stable and unknown is explicit',()=>{
  expect(speciesLabel('쭈갑')).toBe('쭈꾸미ㆍ갑오징어');expect(speciesColor('쭈갑')).toBe('#F0E3FF');
  expect(speciesLabel('unknown')).toBe('기타/미확인');expect(eventSpecies({trip:'문어',species:'기타/미확인'})).toBe('문어');
  expect(matchesSpecies('쭈갑','주꾸미')).toBe(true);expect(matchesSpecies('쭈갑','갑오징어')).toBe(true);expect(matchesSpecies('쭈갑','문어')).toBe(false);
});
const html=`<div data-month="2026-10"></div><table><tr><td><div class="re_status"><a onclick="t_popup('/member/popup.new.php?date=20261026&PA_N_UID=6130')">예약하기</a><p>남은인원 <span>20</span>명</p><div class="schedule">공지 출항:05시</div><ul class="schedule2"><ul class="schedule2"><li><a href="#">쭈/갑 (중식 미제공)</a><span class="fc_g"><span class="ico_d">대</span>100,000</span></li><li>문어 <span class="price">120,000원</span></li></ul></ul></div></td></tr></table>`;
test('nested real-format product lists retain linked trip names, prices, species and departure in both DOMs',async()=>{
  for(const dom of [document,parseHTML('<html></html>').document as unknown as Document]) {
    const events=await parseCalendar(html,boat,'2026-10',new Date().toISOString(),dom);
    expect(events.map(e=>e.speciesKey)).toEqual(['주꾸미+갑오징어','문어']);expect(events.map(e=>e.price)).toEqual([100000,120000]);
    expect(events.every(e=>e.departure==='05:00' && e.remaining===20)).toBe(true);
  }
});
test('duplicate booking buttons cannot overwrite the scope that contains product names',async()=>{
  const duplicate='<div class="re_status"><a onclick="t_popup(\'/member/popup.new.php?date=20261026&PA_N_UID=6130\')">예약하기</a><p>남은인원 20명</p></div>';
  const events=await parseCalendar(html+duplicate,boat,'2026-10',new Date().toISOString());
  expect(events.map(e=>e.speciesKey)).toEqual(['주꾸미+갑오징어','문어']);
});
test('species filters project results without corrupting raw records, coverage or month separation; backup keeps preferences',async()=>{
  const state=emptyState();state.boats=[boat];state.selectedUids=[boat.uid];state.tiers.tier1=[boat.uid];state.month='2026-10';
  state.events=await parseCalendar(html,boat,'2026-10',new Date().toISOString());
  const raw=JSON.stringify(state.events),q={month:'2026-10',requiredPeople:1,tier:'all' as const,search:'',matchingOnly:true};
  expect(queryMonth(state,{...q,species:'갑오징어'}).events).toHaveLength(1);
  const empty=queryMonth(state,{...q,species:'갈치'});expect(empty.events).toHaveLength(0);expect(empty.checkedCount).toBe(1);expect(empty.missingBoats).toHaveLength(0);
  expect(queryMonth(state,{...q,excludedSpeciesKeys:['쭈갑']}).events[0].speciesKey).toBe('문어');
  expect(queryMonth(state,{...q,month:'2026-11'}).events).toHaveLength(0);expect(JSON.stringify(state.events)).toBe(raw);
  state.selectedSpecies='갑오징어';state.excludedSpeciesKeys=['문어'];const restored=importData(JSON.parse(exportData(state))).state;
  expect(restored.selectedSpecies).toEqual(['갑오징어']);expect(restored.excludedSpeciesKeys).toEqual(['문어']);expect(restored.events[0].speciesKey).toBe('주꾸미+갑오징어');
});
