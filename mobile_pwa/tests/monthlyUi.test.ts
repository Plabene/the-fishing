// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { saveState,loadState } from '../src/availabilityStore';
import { defaultFleet } from '../src/defaultFleet';
import published from '../src/data/publishedPreferences.json';

test('month query form, people filter, list/day views and empty month work end to end',async()=>{
  const fleet=defaultFleet();fleet.month='2026-10'; await saveState(fleet);
  document.body.innerHTML='<div id="app"></div>';
  const network=vi.fn(()=>Promise.reject(new Error('Unexpected network')));vi.stubGlobal('fetch',network);
  await import('../src/main');
  expect(network).not.toHaveBeenCalled();
  (document.querySelector('#query-mode') as HTMLSelectElement).value='saved';document.querySelector('#query-mode')!.dispatchEvent(new Event('change'));
  const el=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
  const count=()=>Number((el('#summary').textContent || '').match(/(\d+)개 출조/)?.[1]);
  expect(document.querySelector('h1')?.textContent).toBe('월별 예약 조회');
  expect(el('#fleet-count').textContent).toContain(`${published.selectedUids.length}척 선택 / 전체 ${fleet.boats.length}척`);
  const baseline=count(); expect(baseline).toBeGreaterThan(0);
  expect(el('#query-status').textContent).toContain('2026. 10. 1.');
  const people=el('#people') as HTMLInputElement; people.value='20';
  el('#query-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  expect(count()).toBeLessThan(baseline); expect((await loadState() as {requiredPeople:number}).requiredPeople).toBe(20);
  people.value='1'; el('#query-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  el('#view-list').click(); expect(el('#month-results').hidden).toBe(false);expect(el('#calendar-layout').hidden).toBe(true);
  expect(document.querySelectorAll('.monthly-result')).toHaveLength(Math.min(50,baseline));
  const more=document.querySelector<HTMLButtonElement>('.more-results'); if (more) { more.click(); expect(document.querySelectorAll('.monthly-result').length).toBeGreaterThan(50); }
  el('.month-date-heading').click(); expect(el('#calendar-layout').hidden).toBe(false);expect(el('#day-view').textContent).toContain('출조 일정');
  const month=el('#month') as HTMLInputElement; month.value='2027-01';month.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
  expect(count()).toBe(0);expect(el('#query-status').textContent).toContain('이 월의 저장 자료가 없습니다');
  expect(el('#day-view').textContent).toContain('예약 마감을 뜻하지 않습니다');
});
