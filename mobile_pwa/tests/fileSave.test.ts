// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {canShareJson,saveJsonFile} from '../src/fileSave';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
test('download attaches a JSON file with a timestamp and releases its URL after the mobile handoff',async()=>{
  vi.useFakeTimers();const create=vi.fn<(file:Blob)=>string>(()=> 'blob:tiers'),revoke=vi.fn();
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.isConnected).toBe(true);expect(this.download).toMatch(/^thefishing-tiers-.*\.json$/);});
  expect(await saveJsonFile('{"a":1}','thefishing-tiers')).toBe('download');expect(click).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toBeInstanceOf(File);expect(document.querySelector('a[download]')).toBeNull();expect(revoke).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000);expect(revoke).toHaveBeenCalledWith('blob:tiers');
});
test('share starts in the click turn with a JSON File and cancellation never downloads',async()=>{
  const share=vi.fn().mockResolvedValue(undefined),canShare=vi.fn(()=>true);vi.stubGlobal('navigator',{share,canShare});
  expect(canShareJson()).toBe(true);const result=saveJsonFile('{}','tiers',true);
  expect(share).toHaveBeenCalledOnce();expect(share.mock.calls[0][0].files[0].type).toBe('application/json');expect(await result).toBe('shared');
  share.mockRejectedValueOnce(new DOMException('cancel','AbortError'));expect(await saveJsonFile('{}','tiers',true)).toBe('cancelled');
  share.mockRejectedValueOnce(new DOMException('blocked','NotAllowedError'));await expect(saveJsonFile('{}','tiers',true)).rejects.toThrow('blocked');
});
test('unsupported file sharing falls back to a regular download',async()=>{
  vi.useFakeTimers();vi.stubGlobal('navigator',{canShare:()=>false});
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:tiers'),revokeObjectURL:vi.fn()}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  expect(canShareJson()).toBe(false);expect(await saveJsonFile('{}','tiers',true)).toBe('download');await vi.runAllTimersAsync();
});
