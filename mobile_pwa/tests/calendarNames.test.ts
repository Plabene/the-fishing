// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import {renderCalendar} from '../src/calendarView';
import {emptyState} from '../src/models';
import {defaultFleet} from '../src/defaultFleet';
import {readFileSync} from 'node:fs';

test('calendar cells put complete vessel names before species without platform badges',()=>{
  const state=emptyState();state.month='2026-10';
  state.boats=[{uid:'6130',name:'이름이 긴 더피싱 시험선박호',port:'',url:''},defaultFleet().boats.find(b=>b.uid==='sunsang24:ship:115')!];
  state.selectedUids=state.boats.map(b=>b.uid);
  state.events=state.boats.flatMap((b,i)=>[0,1].map(n=>({id:`${i}:${n}`,uid:b.uid,date:'2026-10-25',trip:n ? '문어':'갑오징어',remaining:4,verified:true,observedAt:new Date().toISOString(),port:'',departure:'05:00',source:'api' as const})));
  const root=document.createElement('div'),onSelect=vi.fn();renderCalendar(root,state,'all','','2026-10-01',onSelect);
  const labels=[...root.querySelectorAll<HTMLElement>('.calendar-boat')];expect(labels).toHaveLength(2);
  expect(root.querySelector('.platform-tag')).toBeNull();
  labels.forEach((label,i)=>{
    expect(label.firstElementChild?.className).toBe('calendar-boat-name');expect(label.firstElementChild?.textContent).toBe(state.boats[i].name);
    expect(label.querySelector('.calendar-boat-species')?.textContent).toContain('갑오징어');expect(label.title).toContain(state.boats[i].name);
  });
  labels[0].closest('button')!.click();expect(onSelect).toHaveBeenCalledWith('2026-10-25');
  state.month='2026-11';renderCalendar(root,state,'all','','2026-11-01',onSelect);expect(root.querySelectorAll('.calendar-boat')).toHaveLength(0);
});
test('calendar name CSS overrides the old ellipsis rule and allows long names to wrap',()=>{
  const style=document.createElement('style');style.textContent=readFileSync('src/css/styles.css','utf8')+'\n'+readFileSync('src/css/species.css','utf8');document.head.append(style);
  const label=document.createElement('span');label.className='calendar-boat';label.innerHTML='<span class="calendar-boat-name">까치선장 자이언트호</span><span class="calendar-boat-species">문어</span>';document.body.append(label);
  try {expect(getComputedStyle(label).whiteSpace).toBe('normal');expect(getComputedStyle(label).overflow).toBe('visible');expect(getComputedStyle(label.firstElementChild!).overflowWrap).toBe('anywhere');expect(getComputedStyle(label.lastElementChild!).textOverflow).toBe('ellipsis');}
  finally {style.remove();label.remove();}
});
