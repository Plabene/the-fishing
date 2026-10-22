import { expect, test } from 'vitest';
import { emptyState } from '../src/models';
import { queryMonth } from '../src/monthlyQuery';
import { importData, exportData } from '../src/importLegacy';
import { normalizeSpeciesSelection } from '../src/species';

function sample() {
  const state=emptyState();state.month='2026-10';state.boats=[{uid:'563',name:'시험호',port:'',url:''}];state.selectedUids=['563'];state.tiers.tier1=['563'];
  state.events=['쭈/갑','갑오징어','문어','광어','다운샷'].map((trip,i)=>({id:String(i),uid:'563',date:'2026-10-26',trip,port:'',departure:'05:00',remaining:10,verified:true,observedAt:'2026-10-01T00:00:00Z',source:'imported' as const}));
  state.events.push({...state.events[2],id:'next',date:'2026-11-26'});return state;
}
const query={month:'2026-10',requiredPeople:1,tier:'all' as const,search:'',matchingOnly:true};
test('multiple species use OR, compound trips appear once, and existing constraints still apply',()=>{
  const state=sample(),raw=JSON.stringify(state.events);state.selectedSpecies=['갑오징어','문어'];
  const result=queryMonth(state,query);expect(new Set(result.events.map(e=>e.id))).toEqual(new Set(['0','1','2']));
  expect(queryMonth(state,{...query,species:['주꾸미','갑오징어']}).events).toHaveLength(2);
  expect(queryMonth(state,{...query,excludedSpeciesKeys:['쭈갑']}).events).toHaveLength(2);
  expect(queryMonth(state,{...query,requiredPeople:11}).events).toHaveLength(0);
  expect(queryMonth(state,{...query,search:'문어'}).events.map(e=>e.id)).toEqual(['2']);
  expect(queryMonth(state,{...query,month:'2026-11'}).events.map(e=>e.id)).toEqual(['next']);
  expect(JSON.stringify(state.events)).toBe(raw);expect(result.checkedCount).toBe(1);
});
test('all, no selection and unknown have distinct semantics; zero matches retain query coverage',()=>{
  const state=sample();state.selectedSpecies=['문어'];
  expect(queryMonth(state,{...query,species:'all'}).events).toHaveLength(5);
  const none=queryMonth(state,{...query,species:[]});expect(none.events).toHaveLength(0);expect(none.checkedCount).toBe(1);expect(none.missingBoats).toHaveLength(0);expect(none.speciesCounts.size).toBe(5);
  expect(queryMonth(state,{...query,species:['unknown']}).events.map(e=>e.trip)).toEqual(['다운샷']);
});
test('single-choice backups migrate and multiple choices including empty selections survive backup round trips',()=>{
  const state=sample();state.selectedSpecies='갑오징어';expect(importData(state).state.selectedSpecies).toEqual(['갑오징어']);
  for(const selected of [['주꾸미','문어'],[],'all']) {
    state.selectedSpecies=selected;state.excludedSpeciesKeys=['광어'];
    const restored=importData(JSON.parse(exportData(state))).state;
    expect(restored.selectedSpecies).toEqual(selected);expect(restored.excludedSpeciesKeys).toEqual(['광어']);expect(restored.events).toHaveLength(state.events.length);
  }
  expect(normalizeSpeciesSelection(['쭈꾸미','주꾸미','문어','다운샷',null,{},''])).toEqual(['주꾸미','문어']);
});
