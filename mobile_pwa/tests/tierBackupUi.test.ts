// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {saveState,loadState} from '../src/availabilityStore';
import {defaultFleet} from '../src/defaultFleet';
import {orderedBoats} from '../src/tierStore';
import {saveJsonFile} from '../src/fileSave';
import {exportTierBackup} from '../src/tierBackup';
import type {AppState} from '../src/models';
vi.mock('../src/fileSave',()=>({canShareJson:()=>true,saveJsonFile:vi.fn(async()=> 'download')}));

test('the complete fleet is usable, platform filters keep every match, and tier files save, restore and undo',async()=>{
  const state=defaultFleet();await saveState(state);document.body.innerHTML='<div id="app"></div>';localStorage.clear();
  const network=vi.fn(()=>Promise.reject(new Error('Unexpected network')));vi.stubGlobal('fetch',network);
  try {
    await import('../src/main');const el=(s:string)=>document.querySelector<HTMLElement>(s)!;
    const settle=()=>vi.waitFor(()=>expect(el('#app').getAttribute('aria-busy')).toBe('false'),{timeout:10000});await settle();
    expect(document.querySelectorAll('.boat-row')).toHaveLength(state.boats.length);expect(el('#boats').textContent).not.toContain('200척만');
    const firstRow=el('.boat-row'),month=el('#month') as HTMLInputElement;
    month.value='2027-05';month.dispatchEvent(new Event('change'));await settle();expect(el('.boat-row')).toBe(firstRow);
    const last=orderedBoats(state).at(-1)!,row=()=>el(`.boat-row[data-uid="${last.uid}"]`);
    const select=row().querySelector('select')!;select.value='tier1';select.dispatchEvent(new Event('change'));await settle();
    expect((await loadState() as AppState).tiers.tier1).toContain(last.uid);
    el('#platform-filter button[data-platform="sunsang24"]').click();await settle();
    expect(document.querySelectorAll('.boat-row')).toHaveLength(380);
    el('#platform-filter button[data-platform="all"]').click();await settle();expect(document.querySelectorAll('.boat-row')).toHaveLength(state.boats.length);
    el('#tier-export').click();await vi.waitFor(()=>expect(saveJsonFile).toHaveBeenCalledOnce());
    const saved=vi.mocked(saveJsonFile).mock.calls[0];expect(saved[1]).toBe('thefishing-tiers');expect(JSON.parse(saved[0]).tiers.tier1).toContain(last.uid);expect(JSON.parse(saved[0]).events).toBeUndefined();
    await vi.waitFor(()=>expect(el('#message').textContent).toContain('다운로드를 요청'));
    el('#tier-share').click();await vi.waitFor(()=>expect(saveJsonFile).toHaveBeenCalledTimes(2));expect(vi.mocked(saveJsonFile).mock.calls[1][2]).toBe(true);
    const input=el('#tier-import') as HTMLInputElement;
    const upload=async(content:string)=>{Object.defineProperty(input,'files',{configurable:true,value:[{size:content.length,text:async()=>content}]});input.dispatchEvent(new Event('change'));await settle();};
    const previous=await loadState() as AppState,file=JSON.parse(exportTierBackup(previous));
    for(const ids of Object.values(file.tiers) as string[][]) {const index=ids.indexOf(last.uid);if(index>=0) ids.splice(index,1);}
    file.tiers.tier3.unshift(last.uid);file.selectedUids=file.selectedUids.filter((id:string)=>id!==last.uid);
    await upload(JSON.stringify(file));const restored=await loadState() as AppState;expect(restored.tiers.tier3[0]).toBe(last.uid);expect(restored.selectedUids).not.toContain(last.uid);expect(restored.events).toEqual(previous.events);
    expect(el('#undo').hidden).toBe(false);el('#undo').click();await settle();expect((await loadState() as AppState).tiers).toEqual(previous.tiers);
    await upload('{"format":"thefishing-tier-backup","version":42}');expect(el('#message').textContent).toContain('기존 설정을 유지');expect((await loadState() as AppState).tiers).toEqual(previous.tiers);
    expect(network).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();}
},30000);
