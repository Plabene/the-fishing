// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {emptyState,type AppState} from '../src/models';
import {queryScopeFingerprint,beginQuerySession,queryScopeChanged,renderQueryFeedback,installQueryRecovery} from '../src/queryFeedback';
import {finishFilterPanels,type QueryIssue} from '../src/filterPanels';
import {queryMonth} from '../src/monthlyQuery';
import {appLayout} from '../src/appLayout';

function fixture():AppState {const s=emptyState();s.month='2026-11';s.boats=['1','2','sunsang24:ship:3'].map(uid=>({uid,name:uid,url:'',port:'비응항',region:{sea:'서해권',province:'전북',local:'군산'}}));s.tiers.tier1=s.boats.map(b=>b.uid);s.selectedUids=['legacy'];return s;}
afterEach(()=>document.body.replaceChildren());
test('canonical request identity normalizes aliases, order and duplicates without changing state or legacy selections',()=>{
  const s=fixture();s.selectedRegion={sea:'서해권',province:['전라북도','전북'],local:['군산','군산시'],port:['비응항','비응항']};
  const before=structuredClone(s),key=queryScopeFingerprint(s);
  const equivalent={...s,boats:[...s.boats].reverse(),selectedTiers:['other','tier2','tier3','tier1'] as const,selectedRegion:{sea:['서해권'],province:'전북특별자치도',local:'군산',port:'비응항'}};
  expect(queryScopeFingerprint({...equivalent,selectedTiers:[...equivalent.selectedTiers]})).toBe(key);
  expect(queryScopeFingerprint({...s,selectedUids:[],selectedSpecies:{mode:'options',keys:['갑오징어']},excludedSpeciesKeys:['주꾸미']})).toBe(key);
  for(const changed of [{month:'2026-12'},{requiredPeople:2},{selectedPlatform:'thefishing' as const},{selectedTiers:['tier1'] as const},{selectedRegion:{...s.selectedRegion,port:'다른항'}},{boats:s.boats.slice(0,2)}]) expect(queryScopeFingerprint({...s,...changed,selectedTiers:changed.selectedTiers?[...changed.selectedTiers]:s.selectedTiers})).not.toBe(key);
  expect(s).toEqual(before);
});
test('scope history retains original counts on month change while a new session resets only the request status',()=>{
  const s=fixture(),root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);
  const session={...beginQuerySession(s,'all','success'),counts:{total:3,success:3,failed:0,unqueried:0}};
  s.month='2026-12';const result=queryMonth(s,{month:s.month,requiredPeople:1,tier:'all',search:'',matchingOnly:true});
  renderQueryFeedback(root,s,result,'all',session,[],[],'live');
  expect(root.querySelector('#query-result-state')?.textContent).toBe('조건 변경 · 새 조회 필요');
  expect(root.querySelector('#query-result-counts')?.textContent).toContain('이전 조건의 조회: 완료 · 2026-11 · 3척');
  expect(root.querySelector<HTMLElement>('#recovery-query')!.hidden).toBe(false);
  expect(queryScopeChanged(s,'all',beginQuerySession(s,'all'))).toBe(false);
  renderQueryFeedback(root,s,result,'all',session,[],[],'saved');expect(root.querySelector('#query-result-state')?.textContent).toBe('이전 자료 열람');
});
test.each(['offline','api','storage','invalid',undefined] as const)('unrelated failure %s preserves closed/open panels and keyboard focus',issue=>{
  const root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);
  const region=root.querySelector<HTMLDetailsElement>('#region-toggle')!,species=root.querySelector<HTMLDetailsElement>('#species-toggle')!,submit=root.querySelector<HTMLButtonElement>('#query-submit')!;
  submit.focus();species.open=true;
  for(const outcome of ['error','partial','cancelled','loading'] as const) {finishFilterPanels(root,outcome,issue as QueryIssue);expect(region.open).toBe(false);expect(species.open).toBe(true);expect(document.activeElement).toBe(submit);}
  finishFilterPanels(root,'error','scope');expect(region.open).toBe(true);expect(document.activeElement).toBe(submit);
});
test('management shortcut follows results, opens its disclosure and focuses the actual search; disabled recovery is not focused',()=>{
  const root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);installQueryRecovery(root);
  const link=root.querySelector<HTMLAnchorElement>('#manage-tier-boats')!,panel=root.querySelector<HTMLDetailsElement>('#fleet-section')!;
  expect(root.querySelector('#booking-results')!.compareDocumentPosition(link)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(link.compareDocumentPosition(panel)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(link.getAttribute('href')).toBe('#fleet-section');
  link.focus();link.click();expect(panel.open).toBe(true);expect(document.activeElement).toBe(root.querySelector('#fleet-search'));
  const submit=root.querySelector<HTMLButtonElement>('#query-submit')!;submit.disabled=true;root.querySelector<HTMLAnchorElement>('#recovery-query')!.click();expect(document.activeElement).not.toBe(submit);
});
