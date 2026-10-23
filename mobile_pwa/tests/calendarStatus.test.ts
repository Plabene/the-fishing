import {expect,test} from 'vitest';
import {calendarStatus} from '../src/calendarStatus';
import {queryMonth} from '../src/monthlyQuery';
import {emptyState,type AppState,type Observation} from '../src/models';
const date='2026-11-02';
function state(){const s=emptyState();s.month='2026-11';s.requiredPeople=2;s.boats=[{uid:'1',name:'하나호',port:'',url:''}];s.selectedUids=['1'];return s;}
function event(patch:Partial<Observation>={}):Observation{return {id:'a',uid:'1',date,trip:'광어',species:'광어',speciesKey:'광어',remaining:4,port:'',departure:'',observedAt:new Date().toISOString(),verified:true,source:'api',...patch};}
const status=(s:AppState,species='all')=>calendarStatus(s,queryMonth(s,{month:s.month,requiredPeople:s.requiredPeople,tier:'all',search:'',matchingOnly:true,species}),date);
test('a vessel with multiple trips counts once and filters recompute available vessel count',()=>{
  const s=state();s.events=[event(),event({id:'b',remaining:3})];expect(status(s)).toMatchObject({kind:'available',ships:1,label:'1척 가능'});
  expect(status(s,'우럭').kind).toBe('filtered');
});
test('unqueried, successful empty, failed, stale and no vessel states remain distinct',()=>{
  const s=state();expect(status(s).label).toBe('조회 전');
  s.monthChecks=[{uid:'1',month:s.month,requiredPeople:1,observedAt:new Date().toISOString(),source:'api'}];expect(status(s).label).toBe('일정 없음');
  s.monthChecks[0].observedAt='2026-01-01T00:00:00Z';expect(status(s).label).toBe('이전 자료');
  s.failures=[{uid:'1',month:s.month,status:'UNKNOWN',code:'http_500',observedAt:new Date().toISOString()}];expect(status(s).label).toBe('조회 실패');
  s.selectedUids=[];expect(status(s).label).toBe('선박 선택');
});
test('unknown, old, closed and insufficient seats never appear available',()=>{
  for(const [patch,label] of [[{remaining:null},'정보 미확인'],[{source:'imported'},'이전 자료'],[{remaining:0},'예약 마감'],[{remaining:1},'조건 충족 0척']] as const){
    const s=state();s.events=[event(patch)];expect(status(s)).toMatchObject({label,ships:0});
  }
});
test('partially collected closed results do not claim the entire fleet is full',()=>{
  const s=state();s.boats.push({uid:'2',name:'미조회호',port:'',url:''});s.selectedUids.push('2');s.events=[event({remaining:0})];
  expect(status(s).label).toBe('일부 마감');
});
