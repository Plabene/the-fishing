// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderSpeciesFilter} from '../src/speciesFilter';
import {speciesBadge} from '../src/species';
import {renderDay,STATUS_LABELS} from '../src/dayView';
import {emptyState,type Observation} from '../src/models';
import {renderMonthlyList} from '../src/monthlyView';
import {queryMonth} from '../src/monthlyQuery';
const fullName='이름이아주긴시험선박호 · 모든 이름 확인';
function observation(patch:Partial<Observation>={}):Observation {return {id:'one',uid:'1441',date:'2026-11-02',trip:'문어 외수질 오전 출조',speciesKey:'문어',species:'문어',port:'실제 출항항',departure:'05:30',remaining:7,price:120000,verified:true,source:'api',observedAt:new Date().toISOString(),reservationStatus:'available',reservationStatusLabel:'예약 가능',...patch};}
beforeEach(()=>{
  document.body.replaceChildren();const style=document.createElement('style');style.id='full-css';
  style.textContent=[...readFileSync('src/style.css','utf8').matchAll(/@import '\.\/(.*?)';/g)].map(match=>readFileSync('src/'+match[1],'utf8')).join('\n');document.head.append(style);
});
afterEach(()=>{document.querySelector('#full-css')?.remove();document.body.replaceChildren();});
test('selection labels, badges and inclusion chips retain the established species palette when selected and cleared',()=>{
  const main=document.createElement('main'),root=document.createElement('section');root.id='species-filter';main.append(root);document.body.append(main);
  const counts=new Map([['문어',3],['광어',2],['unknown',1],['주꾸미+갑오징어',4]]),onChange=vi.fn();
  const draw=(selection:string|string[])=>renderSpeciesFilter(root,counts,selection,[],onChange);
  for(const selection of ['all',['문어'],[]]) {
    draw(selection);
    for(const [key,color] of [['문어','rgb(220, 238, 255)'],['광어','rgb(255, 224, 230)'],['unknown','rgb(232, 232, 232)'],['주꾸미','rgb(229, 215, 211)'],['갑오징어','rgb(236, 222, 221)']]) {
      const input=root.querySelector<HTMLInputElement>(`[data-species-choice="${key}"]`)!;
      expect(getComputedStyle(input.parentElement!).backgroundColor).toBe(color);
      const chip=root.querySelector(`[data-species="${key}"]`);if(chip) expect(getComputedStyle(chip).backgroundColor).toBe(color);
      const badge=speciesBadge(observation({trip:key,speciesKey:key,species:key}));main.append(badge);expect(getComputedStyle(badge).backgroundColor).toBe(color);badge.remove();
      expect(input.checked).toBe(Array.isArray(selection)&&selection.includes(key));
      expect(getComputedStyle(input).width).toBe('16px');expect(input.disabled).toBe(false);
    }
  }
  expect(getComputedStyle(root.querySelector('[data-species="주꾸미+갑오징어"]')!).backgroundColor).toBe('rgb(240, 227, 255)');
  draw('all');root.querySelector<HTMLInputElement>('[data-species-choice="문어"]')!.click();expect(onChange).toHaveBeenLastCalledWith({mode:'options',keys:['문어']},[]);
  draw(['문어']);root.querySelector<HTMLInputElement>('[data-species-choice="문어"]')!.click();expect(onChange).toHaveBeenLastCalledWith({mode:'options',keys:[]},[]);
  root.querySelector<HTMLButtonElement>('#species-all')!.click();expect(onChange).toHaveBeenLastCalledWith('all',[]);
  renderSpeciesFilter(root,counts,'all',[],onChange,'먼저 조회하세요.');expect([...root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button')].every(node=>node.disabled)).toBe(true);
});
test('compact day cards retain every reservation field, full names, source links and original observations',()=>{
  const s=emptyState();s.month='2026-11';s.boats=[{uid:'1441',name:fullName,port:'등록항',url:'https://thefishing.kr/reservation/list.php?uid=1441',region:{sea:'서해권',province:'충청남도',local:'보령시'}}];s.selectedUids=['1441'];s.tiers.tier1=['1441'];s.events=[observation()];
  const before=JSON.stringify(s),root=document.createElement('section');document.body.append(root);renderDay(root,s,'2026-11-02','all','');
  const card=root.querySelector('.event-card')!,copy=card.textContent!;
  for(const text of [fullName,'더피싱','어종 · 문어','문어 외수질 오전 출조','실제 출항항','05:30','보령','조회 당시 잔여 7석','120,000원 · 조회 당시 요금','원본 예약 상태 · 예약 가능',STATUS_LABELS.AVAILABLE,new Date(s.events[0].observedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})]) expect(copy).toContain(text);
  expect(root.textContent).toContain('1티어');expect(root.textContent).toContain('물때 상세');
  expect(card.querySelector('h4')!.textContent).toBe(fullName);expect(getComputedStyle(card.querySelector('h4')!).overflow).not.toBe('hidden');
  const link=card.querySelector<HTMLAnchorElement>('a')!;expect(link.href).toBe(s.boats[0].url);expect(link.target).toBe('_blank');expect(link.rel).toContain('noopener');
  expect(getComputedStyle(card).display).toBe('flex');expect(card.querySelector('.event-heading .seats')?.textContent).toContain('7석');
  expect(JSON.stringify(s)).toBe(before);
});

test('monthly rows retain all evidence and source actions when the footer is moved below the columns',()=>{
  const s=emptyState();s.month='2026-11';s.boats=[{uid:'1441',name:fullName,port:'등록항',url:'https://thefishing.kr/reservation/list.php?uid=1441',region:{sea:'서해권',province:'충청남도',local:'보령시'}}];s.selectedUids=['1441'];s.tiers.tier1=['1441'];s.events=[observation({species:'쭈꾸미, 갑오징어',speciesKey:'주꾸미+갑오징어',trip:'쭈꾸미, 갑오징어 오전 출조'})];
  const before=JSON.stringify(s),root=document.createElement('section'),onDay=vi.fn();document.body.append(root);
  renderMonthlyList(root,s,queryMonth(s,{month:s.month,requiredPeople:1,tier:'all',search:'',matchingOnly:false}),50,vi.fn(),onDay);
  const row=root.querySelector('.monthly-result')!,copy=row.textContent!;
  for(const value of [fullName,'더피싱','1티어','쭈꾸미ㆍ갑오징어','쭈꾸미, 갑오징어 오전 출조','실제 출항항','05:30','7석','120,000원','원본 예약 상태 · 예약 가능']) expect(copy).toContain(value);
  expect(row.querySelector('.monthly-footer .timestamp')?.textContent).toBe(new Date(s.events[0].observedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}));
  expect(row.querySelector<HTMLAnchorElement>('.monthly-footer a')?.href).toBe(s.boats[0].url);
  (root.querySelector('.month-date-heading') as HTMLButtonElement).click();expect(onDay).toHaveBeenCalledWith('2026-11-02',true);
  expect(JSON.stringify(s)).toBe(before);
});

test('status, provider and small secondary text palettes meet AA contrast without changing species backgrounds',()=>{
  const main=document.createElement('main');document.body.append(main);
  const luminance=(value:string)=>{value=value.replace(/var\((--[\w-]+)\)/g,(_,key)=>getComputedStyle(document.documentElement).getPropertyValue(key)).trim();const components=value.startsWith('#')?value.slice(1).match(/../g)!.map(hex=>parseInt(hex,16)):value.match(/[\d.]+/g)!.slice(0,3).map(Number);const rgb=components.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  const contrast=(fg:string,bg:string)=>{const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  for(const cls of ['status-available','status-unknown','status-unverified','status-stale','status-full','status-blocked','status-demo','status-unavailable','platform-thefishing','platform-sunsang24','platform-external']) {
    const span=document.createElement('span');span.className=cls;main.append(span);const css=getComputedStyle(span);
    expect(contrast(css.color,css.backgroundColor),cls).toBeGreaterThanOrEqual(4.5);
  }
  for(const cls of ['timestamp','muted','quiet-danger']) {const span=document.createElement(cls==='quiet-danger'?'button':'span');span.className=cls;main.append(span);expect(contrast(getComputedStyle(span).color,'rgb(245,247,246)'),cls).toBeGreaterThanOrEqual(4.5);}
});
test.each([
  [{remaining:0},'확인된 인원 미달','0석'],
  [{remaining:null},'확인 불가','미확인'],
  [{source:'imported'},'이전 자료','7석'],
  [{verified:false},'미검증','7석'],
  [{reservationStatus:'closed',reservationStatusLabel:'예약 마감'},'예약 가능 상태 아님','7석'],
] as const)('compacting preserves the meaning of reservation state %j',(patch,status,seats)=>{
  const s=emptyState();s.month='2026-11';s.boats=[{uid:'1441',name:fullName,port:'',url:''}];s.selectedUids=['1441'];s.events=[observation({...patch,price:null,departure:''})];
  const root=document.createElement('section');renderDay(root,s,'2026-11-02','all','');
  const card=root.querySelector('.event-card')!;expect(card.textContent).toContain(status);expect(card.textContent).toContain(seats);expect(card.textContent).toContain('시간 미표시');expect(card.textContent).not.toContain('0원');
});
