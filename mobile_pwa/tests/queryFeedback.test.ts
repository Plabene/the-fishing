// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {emptyState,type Observation} from '../src/models';
import {appLayout} from '../src/appLayout';
import {renderCalendar} from '../src/calendarView';
import {renderDay} from '../src/dayView';
import {queryMonth} from '../src/monthlyQuery';
import {renderQueryFeedback,requestCounts,queryScopeFingerprint,revealSelectedDay,type QuerySession} from '../src/queryFeedback';
import type {LiveRow} from '../src/liveQuery';

afterEach(()=>{vi.unstubAllGlobals();document.body.replaceChildren();});
function fixture() {
  const state=emptyState();state.month='2026-11';
  state.boats=['1','2','3'].map(uid=>({uid,name:'여정'+uid,port:'비응항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`}));
  state.selectedUids=state.boats.map(b=>b.uid);state.tiers.tier1=[...state.selectedUids];
  state.events=['1','1','2','3'].map((uid,index):Observation=>({id:String(index),uid,date:'2026-11-06',trip:uid==='1'?'쭈꾸미, 갑오징어':'갑오징어',port:'비응항',departure:'05:00',remaining:4,observedAt:new Date().toISOString(),source:'api',verified:true}));
  const root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);
  const result=()=>queryMonth(state,{month:state.month,requiredPeople:1,tier:'all',search:'',matchingOnly:true});
  return {root,state,result,get:(id:string)=>root.querySelector<HTMLElement>('#'+id)!};
}

test('calendar overflow counts distinct identities, preserves tide metadata and exact compound filtering',()=>{
  const {get,state,result}=fixture(),select=vi.fn();
  renderCalendar(get('calendar'),state,'all','','2026-11-01',select,true,result());
  let day=get('calendar').querySelector<HTMLButtonElement>('[data-date="2026-11-06"]')!;
  expect(day.querySelectorAll('.calendar-boat-name')).toHaveLength(2);expect(day.querySelector('.calendar-overflow')?.textContent).toBe('+1척 더 보기');
  expect(day.getAttribute('aria-label')).toContain('일정 4건');expect(day.getAttribute('aria-label')).toContain('미리보기 외 1척');expect(day.querySelector('.calendar-tide')).not.toBeNull();
  day.focus();day.click();expect(select).toHaveBeenCalledExactlyOnceWith('2026-11-06',true);
  renderCalendar(get('calendar'),state,'all','','2026-11-06',select,true,result());
  day=get('calendar').querySelector<HTMLButtonElement>('[data-date="2026-11-06"]')!;expect(document.activeElement).toBe(day);
  state.selectedSpecies={mode:'options',keys:['갑오징어']};renderCalendar(get('calendar'),state,'all','','2026-11-06',select,true,result());
  day=get('calendar').querySelector<HTMLButtonElement>('[data-date="2026-11-06"]')!;expect(day.querySelector('.calendar-overflow')).toBeNull();expect(day.textContent).not.toContain('여정1');
  state.selectedSpecies={mode:'options',keys:['주꾸미+갑오징어']};renderDay(get('day-view'),state,'2026-11-06','all','',true,result());
  expect(get('day-heading').textContent).toContain('1척 · 2개');expect(get('day-view').querySelectorAll('.event-card')).toHaveLength(2);expect(get('day-view').textContent).toContain('쭈꾸미ㆍ갑오징어');
});

test.each([{narrow:true,reduce:true,keyboard:true},{narrow:true,reduce:false,keyboard:false},{narrow:false,reduce:false,keyboard:true}])('date navigation focuses/announces once without desktop scrolling: %o',({narrow,reduce,keyboard})=>{
  const {root,state,result,get}=fixture();
  vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:query.includes('max-width')?narrow:reduce})));
  renderDay(get('day-view'),state,'2026-11-06','all','',true,result());
  const stable=get('query-submit');stable.focus();const scroll=vi.fn();get('day-view').scrollIntoView=scroll;
  revealSelectedDay(root,keyboard);
  if(narrow) expect(scroll).toHaveBeenCalledWith({block:'nearest',behavior:reduce?'auto':'smooth'});else expect(scroll).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(narrow&&keyboard?get('day-heading'):stable);
  expect(get('app-announcement').textContent).toBe(narrow&&keyboard?'':get('day-heading').textContent);
  expect(get('day-view').hasAttribute('aria-live')).toBe(false);
});

test('request counts do not count duplicate rows or unrelated IDs and differ from filtered targets',()=>{
  const {root,state,result,get}=fixture();const success:LiveRow={boat:state.boats[0],result:{status:'ALLOWED_READABLE',message:'fixture',events:[],observedAt:new Date().toISOString(),fresh:true,cached:false}};
  const failed:LiveRow={boat:state.boats[1],result:{status:'HTTP_ERROR',events:[],message:'fixture',stop:false}};
  const rows=[success,success,failed,{...failed,boat:{...failed.boat,uid:'unrelated'}}];
  expect(requestCounts(state.boats,rows)).toEqual({total:3,success:1,failed:1,unqueried:1});
  state.selectedUids=['1'];const session:QuerySession={scope:queryScopeFingerprint(state),month:state.month,outcome:'partial'};
  renderQueryFeedback(root,state,result(),'all',session,state.boats,rows,'live');
  expect(get('query-result-scope').textContent).toContain('현재 대상 1척');expect(get('query-result-counts').textContent).toContain('마지막 요청 대상 3척 · 확인 1척 · 실패/미지원 1척 · 미조회 1척');
  expect(get('query-result-state').textContent).toBe('일부 완료');expect(get('recovery-official').hidden).toBe(false);
  renderQueryFeedback(root,state,result(),'all',session,state.boats,rows,'saved');expect(get('query-result-state').textContent).toBe('이전 자료 열람');expect(get('query-result-note').textContent).toContain('현재 잔여석이 아닙니다');expect(get('last-observed').textContent).toContain('이전 자료');
  renderQueryFeedback(root,state,result(),'all',{scope:queryScopeFingerprint({...state,month:'2026-10'}),month:'2026-10',outcome:'success'},state.boats,rows,'live');expect(get('query-result-state').textContent).toBe('조건 변경 · 새 조회 필요');
});

test('offline, expired observation, successful empty and failure do not imply fully booked',()=>{
  const {root,state,result,get}=fixture(),session:QuerySession={scope:queryScopeFingerprint(state),month:state.month,outcome:'success'};
  vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  renderQueryFeedback(root,state,result(),'all',session,state.boats,[],'live');expect(get('last-observed').textContent).toContain('오프라인');vi.restoreAllMocks();
  state.events.forEach(e=>e.observedAt='2026-01-01T00:00:00Z');renderQueryFeedback(root,state,result(),'all',session,state.boats,[],'live');expect(get('last-observed').textContent).toContain('시간 경과');
  state.selectedSpecies=[];renderQueryFeedback(root,state,result(),'all',session,state.boats,[],'live');expect(get('query-result-note').textContent).toContain('선택 조건에 맞는 일정 없음');expect(get('recovery-species').hidden).toBe(false);
  renderQueryFeedback(root,state,result(),'all',{...session,outcome:'error',issue:'api',message:'조회 API를 먼저 연결하세요.'},state.boats,[],'live');expect(get('recovery-api').hidden).toBe(false);expect(get('query-result-state').textContent).toBe('실패');expect(get('query-result-counts').textContent).toContain('요청 전 대상 3척');
});

 test('storage errors retain actual response counts while live seats remain unavailable',()=>{
  const {root,state,result,get}=fixture();state.events=[];
  renderQueryFeedback(root,state,result(),'all',{scope:queryScopeFingerprint(state),month:state.month,outcome:'error',issue:'storage',message:'기기에 반영하지 못했습니다.',counts:{total:3,success:2,failed:1,unqueried:0}},state.boats,[],'live');
  expect(get('query-result-state').textContent).toBe('실패');expect(get('query-result-counts').textContent).toContain('확인 2척 · 실패/미지원 1척 · 미조회 0척');expect(get('query-result-note').textContent).toBe('기기에 반영하지 못했습니다.');expect(get('last-observed').textContent).toContain('확인된 자료 없음');
});
