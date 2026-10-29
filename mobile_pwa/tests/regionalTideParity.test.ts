import {test,expect} from 'vitest';
import fixture from './fixtures/regional-tides-pc-parity.json';
import {calculateTideMonth,mergeTideDays} from '../src/tides';
import type {TideStationCode} from '../src/tideStations';
import {importData,exportData} from '../src/importLegacy';
import {emptyState} from '../src/models';
const days=mergeTideDays(fixture.days);
test.each(fixture.scenarios)('official $station $month forecasts agree with existing PC flow calculation',scenario=>{
 const actual=calculateTideMonth(scenario.month,days,scenario.station as TideStationCode);
 expect(Object.keys(actual.days).sort()).toEqual(Object.keys(scenario.expected).sort());
 for(const [date,expected] of Object.entries(scenario.expected)) expect(actual.days[date]).toMatchObject(expected);
 expect(actual.complete).toBe(Object.keys(scenario.expected).length===31);
});
test('multi-station official forecasts survive full backup without changing personal tier preferences',()=>{
 const state=emptyState();state.tideDays=days;state.boats=[{uid:'9999',name:'검증 선박',port:'여수',url:'https://thefishing.kr/reservation/list.php?uid=9999'}];state.tiers.tier1=['9999'];
 const restored=importData(JSON.parse(exportData(state))).state;
 expect(restored.tideDays).toEqual(days);expect(restored.tiers).toEqual(state.tiers);
});
