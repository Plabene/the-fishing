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
    expect(label.firstElementChild?.className).toBe('calendar-boat-name');expect(label.firstElementChild?.textContent).toBe(state.boats[i].name);expect((label.firstElementChild as HTMLElement).title).toBe(state.boats[i].name);
    expect(label.querySelector('.calendar-boat-species')?.textContent).toContain('갑오징어');expect(label.title).toContain(state.boats[i].name);
  });
  labels[0].closest('button')!.click();expect(onSelect).toHaveBeenCalledWith('2026-10-25',true);
  state.month='2026-11';renderCalendar(root,state,'all','','2026-11-01',onSelect);expect(root.querySelectorAll('.calendar-boat')).toHaveLength(0);
});
test('calendar names stay on one line with ellipsis under the complete stylesheet cascade',()=>{
  const style=document.createElement('style');style.textContent=[...readFileSync('src/style.css','utf8').matchAll(/@import '\.\/(.*?)';/g)].map(match=>readFileSync('src/'+match[1],'utf8')).join('\n');document.head.append(style);
  const label=document.createElement('span');label.className='calendar-boat';label.innerHTML='<span class="calendar-boat-name">까치선장 자이언트호</span><span class="calendar-boat-species">문어</span>';document.body.append(label);
  try {const name=getComputedStyle(label.firstElementChild!);expect(name.display).toBe('block');expect(name.whiteSpace).toBe('nowrap');expect(name.overflow).toBe('hidden');expect(name.textOverflow).toBe('ellipsis');expect(name.overflowWrap).toBe('normal');expect(getComputedStyle(label.lastElementChild!).textOverflow).toBe('ellipsis');}
  finally {style.remove();label.remove();}
});
