// @vitest-environment jsdom
import { expect,test,vi } from 'vitest';
import 'fake-indexeddb/auto';
import { defaultFleet } from '../src/defaultFleet';
import { saveState,loadState } from '../src/availabilityStore';
import { calculateTideMonth,tideDates,mergeTideDays } from '../src/tides';
import archive from '../src/data/tideArchive.json';
import type { AppState } from '../src/models';
test('calendar uses saved PC tide data offline, changes months, shows day details and preserves bookings on refresh failure',async()=>{
  const state=defaultFleet();state.month='2026-10';await saveState(state);document.body.innerHTML='<div id="app"></div>';
  const request=vi.fn<typeof fetch>();vi.stubGlobal('fetch',request);await import('../src/main');
  const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
  const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  const regionChoice=el('#region-sea input'),regionField=el('[data-region-field="sea"]') as HTMLDetailsElement;regionField.open=true;
  regionChoice.focus();
  expect(request).not.toHaveBeenCalled();expect(el('#tide-status').textContent).toContain('31/31일');expect(document.querySelectorAll('.calendar-tide')).toHaveLength(31);
  const expected=calculateTideMonth('2026-10',mergeTideDays(archive.days)),gold=Object.values(expected.days).find(d=>d.grade==='gold')!;
  const cell=el(`.calendar-day[aria-label^="${gold.date}"]`);expect(cell.dataset.tideGrade).toBe('gold');expect(cell.textContent).toContain(`물흐름 ${gold.flowPercent}%`);cell.click();expect(el('.day-tide').textContent).toContain('고조:');expect(el('.day-tide').textContent).toContain('저조:');
  const month=el('#month') as HTMLInputElement;month.value='2026-11';month.dispatchEvent(new Event('change'));await settle();expect(el('#tide-status').textContent).toContain('30/30일');expect(request).not.toHaveBeenCalled();
  expect(el('#region-sea input')).toBe(regionChoice);expect(regionField.open).toBe(true);expect(document.activeElement).toBe(regionChoice);
  const before=await loadState() as AppState,allowed=new Set(tideDates('2026-11')),days=mergeTideDays(archive.days).filter(d=>allowed.has(d.date)).map(d=>({...d,fetchedAt:new Date().toISOString()}));
  request.mockResolvedValueOnce(Response.json({schema:1,stationCode:'DT_0025',month:'2026-11',status:'OK',days}));el('#tide-refresh').click();await settle();expect(request).toHaveBeenCalledTimes(1);expect((await loadState() as AppState).events).toEqual(before.events);
  const saved=await loadState();request.mockRejectedValueOnce(new Error('offline'));el('#tide-refresh').click();await settle();expect(el('#message').textContent).toContain('기존 물때·예약 조회 자료는 유지');expect(await loadState()).toEqual(saved);
  expect(el('#region-sea input')).toBe(regionChoice);expect(regionField.open).toBe(true);
  month.value='2028-02';month.dispatchEvent(new Event('change'));await settle();expect(el('#tide-status').textContent).toContain('0/29일');expect(el('.calendar-tide').textContent).toContain('물흐름 —');expect(document.querySelectorAll('[data-tide-grade="gold"]')).toHaveLength(0);vi.unstubAllGlobals();
});
