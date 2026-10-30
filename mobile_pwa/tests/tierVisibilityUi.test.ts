// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {vesselFetch} from './vesselFetch';
import {emptyState,type AppState,TIERS} from '../src/models';
import {loadState,saveState,preferenceBackups} from '../src/availabilityStore';
import {initializeFleet} from '../src/defaultFleet';

test('All to 1-tier queries that tier; excluded and empty target counts never erase saved assignments',async()=>{
  const state=emptyState();state.boats=TIERS.map((t,i)=>({uid:String(9980+i),name:`${i+1}호`,port:'오천항',url:`https://thefishing.kr/reservation/list.php?uid=${9980+i}`,region:{sea:'서해권',province:'충청남도',local:'보령'}}));
  TIERS.forEach((t,i)=>state.tiers[t]=[state.boats[i].uid]);state.selectedUids=state.boats.map(b=>b.uid);state.selectedTiers=[];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn<typeof fetch>(async input=>{
    const url=new URL(String(input)),uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();
    return Response.json({status:'ALLOWED_READABLE',fresh:true,cached:false,observedAt,events:[{id:'direct-12345678901234567890'+uid,uid,date:month+'-06',trip:'갑오징어',remaining:4,verified:true,observedAt,departure:'05:00'}]});
  });vi.stubGlobal('fetch',vesselFetch(request));
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'));
    expect(el('#query-target').textContent).toContain('0척 조회 대상');expect(el('#tier-saved-counts').textContent).toContain('저장 티어 4척');expect(el('#tier-hidden-reasons').textContent).toContain('티어 필터 제외 4척');
    const history=await preferenceBackups();
    el('#tier-show-all').click();await settle();expect(el('#query-target').textContent).toContain('4척 조회 대상');
    expect(el('[data-tier="all"]').getAttribute('aria-pressed')).toBe('true');expect(el('[data-tier="tier1"]').getAttribute('aria-pressed')).toBe('false');
    el('[data-tier="tier1"]').click();await settle();expect(el('#query-target').textContent).toContain('1척 조회 대상');expect((await loadState() as AppState).selectedTiers).toEqual(['tier1']);
    expect(el('#tier-hidden-reasons').textContent).toContain('티어 필터 제외 3척');
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(1);expect(String(request.mock.calls[0][0])).toContain('uid=9980');
    const month=(el('#month') as HTMLInputElement).value;
    el(`.calendar-day[aria-label^="${month}-06"]`).click();expect(el('#day-view').textContent).toContain('1호');expect(el('#day-view').textContent).not.toContain('2호');
    el('[data-tier="tier2"]').click();await settle();expect(el('#query-target').textContent).toContain('2척 조회 대상');
    el('[data-tier="none"]').click();await settle();expect(el('#query-target').textContent).toContain('0척 조회 대상');expect(el('#tier-saved-counts').textContent).toContain('저장 티어 4척');
    el('#query-form').dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(request).toHaveBeenCalledTimes(1);
    el('#tier-show-all').click();await settle();expect(el('#query-target').textContent).toContain('4척 조회 대상');
    el('#tier-open-recovery').click();expect((el('.fleet-management') as HTMLDetailsElement).open).toBe(true);
    el('#next').click();await settle();const saved=await loadState() as AppState;
    expect(saved.tiers).toEqual(state.tiers);expect(saved.selectedUids).toEqual(state.selectedUids);expect(initializeFleet(saved).state.tiers).toEqual(state.tiers);expect(await preferenceBackups()).toEqual(history);
  } finally {vi.unstubAllGlobals();}
});
