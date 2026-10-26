// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {defaultFleet} from '../src/defaultFleet';
import {saveState,loadState} from '../src/availabilityStore';
import {suppliedPreferences,initializePreferenceRecovery} from '../src/preferenceRecovery';
import {TIERS,type AppState} from '../src/models';

test('recovery preview, exact apply, automatic history and month navigation persist without any external query',async()=>{
  const state=defaultFleet();state.tiers={tier1:[],tier2:[suppliedPreferences.tiers.tier1[0]],tier3:[],other:[]};state.selectedUids=[];
  await saveState(state);document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const request=vi.fn(()=>Promise.reject(new Error('Unexpected network')));vi.stubGlobal('fetch',request);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'),{timeout:10000});await settle();
    expect(el('#recovery-preview').textContent).toContain('다른 분류 1개');
    el('#recover-missing').click();await settle();
    expect((await loadState() as AppState).tiers.tier2).toContain(suppliedPreferences.tiers.tier1[0]);
    el('#recover-exact').click();await settle();
    const recovered=await loadState() as AppState;expect(recovered.tiers).toEqual(suppliedPreferences.tiers);expect(recovered.selectedUids).toEqual(suppliedPreferences.selectedUids);
    el('#recovery-history').click();await vi.waitFor(()=>expect(document.querySelectorAll('#recovery-source option').length).toBeGreaterThan(2));
    el('#next').click();await settle();expect((await loadState() as AppState).tiers).toEqual(recovered.tiers);
    // Choose the one-assignment pre-recovery history and restore only that snapshot's scope.
    const source=el('#recovery-source') as HTMLSelectElement,old=[...source.options].find(o=>/티어 1개/.test(o.textContent || ''))!;
    expect(old).toBeDefined();source.value=old.value;source.dispatchEvent(new Event('change'));
    el('#recover-exact').click();await settle();
    const restored=await loadState() as AppState;expect(restored.tiers.tier2).toContain(suppliedPreferences.tiers.tier1[0]);
    expect(TIERS.reduce((n,t)=>n+restored.tiers[t].length,0)).toBe(113);expect(request).not.toHaveBeenCalled();
    // An explicit old full backup may intentionally have no tiers and no recovery marker.
    const intentionallyEmpty={...restored,tiers:{tier1:[],tier2:[],tier3:[],other:[]},selectedUids:[],preferenceRecoveryVersion:undefined};
    const input=el('#import') as HTMLInputElement;
    Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(intentionallyEmpty)}],configurable:true});
    input.dispatchEvent(new Event('change'));await settle();
    const saved=await loadState() as AppState;expect(saved.tiers).toEqual(intentionallyEmpty.tiers);
    expect(initializePreferenceRecovery(saved,true).restored).toBe(0);
  } finally {vi.unstubAllGlobals();}
});
