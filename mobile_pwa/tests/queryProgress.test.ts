// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {QueryProgress} from '../src/queryProgress';
afterEach(()=>vi.useRealTimers());
test('time runs before responses, progress reflects completed boats, and cancellation stops time without inventing completion',()=>{
  vi.useFakeTimers();document.body.innerHTML='<div id="monitor" hidden><span id="query-phase"></span><span id="query-elapsed"></span><progress></progress><p id="query-counts"></p></div>';
  const root=document.querySelector<HTMLElement>('#monitor')!,bar=root.querySelector('progress')!;let now=1000;
  const monitor=new QueryProgress(root,()=>now);monitor.start(5);expect(root.hidden).toBe(false);expect(bar.value).toBe(0);
  now+=3500;vi.advanceTimersByTime(3500);expect(root.textContent).toContain('경과 3.5초');expect(bar.value).toBe(0);
  monitor.update(2,1);expect(bar.value).toBe(2);expect(bar.max).toBe(5);expect(root.textContent).toContain('40%');expect(root.textContent).toContain('실패/미지원 1');
  monitor.finish('조회 취소');const stopped=root.textContent;now+=10000;vi.advanceTimersByTime(10000);expect(root.textContent).toBe(stopped);expect(bar.value).toBe(2);
  monitor.start(2);expect(bar.max).toBe(2);expect(bar.value).toBe(0);expect(root.textContent).toContain('경과 0.0초');
  now+=2200;monitor.update(2,2);monitor.finish('조회 완료');expect(root.textContent).toContain('100%');expect(root.textContent).toContain('경과 2.2초');
  monitor.reset();expect(root.hidden).toBe(true);
});
