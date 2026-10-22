import { expect,test } from 'vitest';
import fixture from './fixtures/tides-pc-parity.json';
import archive from '../src/data/tideArchive.json';
import { calculateTideMonth,mergeTideDays,tideDates,tideGrade,validateTideDay,tideTransitions,type TideDay } from '../src/tides';
import { emptyState } from '../src/models';
import { importData,exportData } from '../src/importLegacy';

test.each(fixture.scenarios)('water flow equals the actual PC implementation: $name',scenario=>{
  const days=mergeTideDays(fixture.days).filter(d=>!scenario.remove.includes(d.date));
  const result=calculateTideMonth(fixture.month,days);
  expect(result.referenceMinCm).toBe(scenario.expected.referenceMinCm);expect(result.referenceMaxCm).toBe(scenario.expected.referenceMaxCm);
  expect(result.complete).toBe(scenario.expected.complete);expect(result.missingBoundaryDates).toEqual(scenario.expected.missingBoundaryDates);
  expect(Object.keys(result.days)).toEqual(Object.keys(scenario.expected.days));
  for(const [date,expected] of Object.entries(scenario.expected.days)) expect(result.days[date]).toMatchObject(expected);
});
test('gold/silver boundaries use integer displayed percent and empty/flat months do not fabricate flow',()=>{
  expect([null,0,29,30,60,61,100].map(tideGrade)).toEqual(['insufficient','gold','gold','silver','silver','normal','normal']);
  expect(calculateTideMonth('2028-02',[]).expectedDays).toBe(29);
  expect(tideDates('2026-12').at(-1)).toBe('2027-01-01');expect(tideDates('2027-01')[0]).toBe('2026-12-31');
  const day=mergeTideDays(fixture.days)[2];expect(calculateTideMonth('2026-11',[day]).days[day.date].flowPercent).toBeNull();
  expect(()=>tideDates('2026-13')).toThrow();
});
test('extrema validation, KST day association and cross-midnight transitions are strict',()=>{
  const base=mergeTideDays(fixture.days)[0];
  for(const patch of [{stationCode:'other'},{date:'2026-02-30'},{fetchedAt:'bad'},{extrema:[{...base.extrema[0],levelCm:NaN}]},{extrema:base.extrema.map(e=>({...e,timestamp:'2026-11-05T00:00:00+09:00'}))}]) expect(()=>validateTideDay({...base,...patch})).toThrow();
  const result=tideTransitions([{timestamp:'2026-10-31T22:00:00+09:00',levelCm:100,kind:'low'},{timestamp:'2026-11-01T04:00:00+09:00',levelCm:700,kind:'high'}]);
  expect(result[0].difference).toBe(600);expect(result[0].start.timestamp.slice(0,10)).toBe('2026-10-31');
  expect(tideTransitions([{timestamp:'2026-10-31T00:00:00+09:00',levelCm:100,kind:'low'},{timestamp:'2026-11-01T04:00:00+09:00',levelCm:700,kind:'high'}])).toEqual([]);
});
test('public PC tide archive and backup preserve only valid measurements and newer records',()=>{
  const days=mergeTideDays(archive.days);expect(days).toHaveLength(158);
  expect(calculateTideMonth('2026-10',days).complete).toBe(true);
  for(const day of days) expect(Object.keys(day).sort()).toEqual(['date','extrema','fetchedAt','stationCode']);
  const newer={...days[0],fetchedAt:new Date().toISOString()},state=emptyState();state.tideDays=mergeTideDays([newer],days);
  const restored=importData(JSON.parse(exportData(state))).state;
  expect(restored.tideDays?.find(d=>d.date===newer.date)?.fetchedAt).toBe(newer.fetchedAt);
  expect(restored.tideDays).toEqual(state.tideDays);
  expect(importData({...state,tideDays:[{...newer,serviceKey:'private',flowPercent:99}]}).state.tideDays?.[0]).not.toHaveProperty('serviceKey');
});
