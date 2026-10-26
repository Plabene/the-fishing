import {beforeEach,expect,test,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {emptyState,type AppState} from '../src/models';

beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());vi.resetModules();});
const fixture=()=>{const state=emptyState();state.boats=[{uid:'1',name:'내 선박',port:'군산',url:''}];state.tiers.tier1=['1'];state.selectedUids=['1'];return state;};
async function rawPut(key:string,value:unknown) {
  const {database}=await import('../src/preferenceProtection'),db=await database();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('local','readwrite');tx.objectStore('local').put(value,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
}
test('personal tiers survive a legacy tab replacing the catalog state and retain boat identity',async()=>{
  const store=await import('../src/preferenceProtection'),state=fixture();await store.saveState(state);
  await rawPut('state',emptyState());const loaded=await store.loadState() as AppState;
  expect(loaded.tiers).toEqual(state.tiers);expect(loaded.selectedUids).toEqual(['1']);expect(loaded.boats).toEqual(state.boats);
});
test('stale tabs cannot overwrite newer preferences or query state; reload resolves the conflict',async()=>{
  const tab1=await import('../src/preferenceProtection'),a=fixture();await tab1.saveState(a);
  vi.resetModules();const tab2=await import('../src/preferenceProtection');await tab2.loadState();
  a.tiers={tier1:[],tier2:['1'],tier3:[],other:[]};await tab1.saveState(a);
  await expect(tab2.saveState(fixture())).rejects.toThrow('다른 탭');
  expect((await tab2.loadState() as AppState).tiers).toEqual(a.tiers);await tab2.saveState(a);
});
test('original migration backup is write-once and preference history survives query-only writes',async()=>{
  const store=await import('../src/preferenceProtection'),a=fixture();await store.saveState(a);await store.backupPreferences(a,'test');
  a.tiers={tier1:[],tier2:['1'],tier3:[],other:[]};await store.saveState(a);await store.backupPreferences(a,'test');
  expect((await store.previousPreferences('test'))!.tiers.tier1).toEqual(['1']);
  const before=await store.preferenceBackups();a.month='2027-01';await store.saveState(a);
  expect(await store.preferenceBackups()).toEqual(before);
  expect(before.some(p=>p.value.tiers.tier1.includes('1'))).toBe(true);expect(before.some(p=>p.value.tiers.tier2.includes('1'))).toBe(true);
});
test('invalid writes and cancellation leave the stored personal data unchanged',async()=>{
  const store=await import('../src/preferenceProtection'),a=fixture();await store.saveState(a);
  const bad=structuredClone(a);bad.tiers.tier2=['1'];await expect(store.saveState(bad)).rejects.toThrow('형식');
  const controller=new AbortController();controller.abort();await expect(store.saveState(emptyState(),controller.signal)).rejects.toThrow();
  expect(await store.loadState()).toEqual(a);
});
test('read errors never allow an empty fallback to overwrite the saved data',async()=>{
  const store=await import('../src/preferenceProtection');await rawPut('state',{schema:999,privateData:'retained'});
  await expect(store.loadState()).rejects.toThrow('형식');await expect(store.saveState(emptyState())).rejects.toThrow('읽기에 실패');
  await expect(store.loadState()).rejects.toThrow('형식');
});
test('quota failure aborts the entire transaction, including protected preferences and history',async()=>{
  const store=await import('../src/preferenceProtection'),a=fixture();await store.saveState(a);const before=await store.preferenceBackups();
  const original=IDBObjectStore.prototype.put,spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,value:unknown,key?:IDBValidKey){
    if(key==='state') throw new DOMException('Storage is full','QuotaExceededError');
    return original.call(this,value,key);
  });
  const changed=structuredClone(a);changed.selectedUids=[];
  try {await expect(store.saveState(changed)).rejects.toThrow('Storage is full');}finally{spy.mockRestore();}
  expect(await store.loadState()).toEqual(a);expect(await store.preferenceBackups()).toEqual(before);
});
