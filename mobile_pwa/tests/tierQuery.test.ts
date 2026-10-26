import {expect,test} from 'vitest';
import {emptyState,TIERS} from '../src/models';
import {tierQueryState,tierQueryBoats} from '../src/tierQuery';
import {queryMonth} from '../src/monthlyQuery';
import {importData,exportData} from '../src/importLegacy';
import recovery from '../src/data/tierRecovery.json';

test('tier membership includes previously unchecked boats, excludes unassigned and missing boats, and preserves backup selections',()=>{
  const state=emptyState();state.month='2026-11';
  state.boats=['1','2','3','4'].map(uid=>({uid,name:uid,port:'항구',url:'',region:{sea:'서해권',province:'전북',local:uid==='4'?'부안':'군산'}}));
  state.tiers={tier1:['1'],tier2:['2'],tier3:['4'],other:['missing']};state.selectedUids=['1','3'];
  state.events=state.boats.map(b=>({id:b.uid,uid:b.uid,date:'2026-11-06',trip:'갑오징어',port:b.port,departure:'05:00',remaining:3,source:'api' as const,verified:true,observedAt:new Date().toISOString()}));
  const before=exportData(state),view=tierQueryState(state);
  expect(view.selectedUids).toEqual(['1','2','4']);
  expect(tierQueryBoats(state,['tier1','tier2']).map(b=>b.uid)).toEqual(['1','2']);
  expect(queryMonth(view,{month:state.month,tier:['tier1','tier2'],requiredPeople:1,search:'',matchingOnly:true}).events.map(e=>e.uid)).toEqual(['1','2']);
  expect(tierQueryBoats(state,[])).toEqual([]);expect(exportData(state)).toBe(before);
  expect(importData(JSON.parse(before)).state.selectedUids).toEqual(['1','3']);
  state.selectedRegion={sea:'',province:'전라북도',local:'군산',port:''};
  expect(tierQueryBoats(state,'all').map(b=>b.uid)).toEqual(['1','2']);
});

test('latest supplied backup yields all 235 assigned boats without rewriting 126 legacy selections',()=>{
  const state=emptyState();state.boats=recovery.boats;state.tiers=recovery.tiers;state.selectedUids=recovery.selectedUids;
  const before=JSON.stringify(state);
  expect(tierQueryBoats(state,'all')).toHaveLength(235);
  expect(TIERS.map(t=>tierQueryBoats(state,t).length)).toEqual([16,21,31,167]);
  expect(state.selectedUids).toHaveLength(126);expect(JSON.stringify(state)).toBe(before);
});
