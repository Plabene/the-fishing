import {expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {watchAppUpdates} from '../src/appUpdate';

test('existing installs request uncached worker updates and offer refresh only when an update activates',async()=>{
  const worker=Object.assign(new EventTarget(),{state:'installing'});
  const registration=Object.assign(new EventTarget(),{installing:worker,update:vi.fn(async()=>{})});
  const container=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>registration)});
  const ready=vi.fn();await watchAppUpdates(container as unknown as ServiceWorkerContainer,'/the-fishing/',ready);
  expect(container.register).toHaveBeenCalledWith('/the-fishing/sw.js',{updateViaCache:'none'});expect(registration.update).toHaveBeenCalledOnce();expect(ready).not.toHaveBeenCalled();
  worker.state='activated';worker.dispatchEvent(new Event('statechange'));expect(ready).toHaveBeenCalledOnce();
});
test('first install does not ask for an unnecessary reload',async()=>{
  const registration=Object.assign(new EventTarget(),{installing:null,update:vi.fn(async()=>{})});
  const container=Object.assign(new EventTarget(),{controller:null,register:vi.fn(async()=>registration)}),ready=vi.fn();
  await watchAppUpdates(container as unknown as ServiceWorkerContainer,'/',ready);
  container.dispatchEvent(new Event('controllerchange'));expect(ready).not.toHaveBeenCalled();
  container.dispatchEvent(new Event('controllerchange'));expect(ready).toHaveBeenCalledOnce();
});
test('online navigation bypasses stale app HTML, offline still opens, API seats never enter service-worker cache',async()=>{
  const handlers=new Map<string,(e:unknown)=>void>(),network=vi.fn<typeof fetch>(async()=>new Response('new app'));
  const match=vi.fn(async()=>new Response('offline app')),open=vi.fn(async()=>({match}));
  const code=readFileSync('public/sw.js','utf8').replace('__CACHE__',JSON.stringify('test')).replace('__BASE__',JSON.stringify('/the-fishing/')).replace('__FILES__',JSON.stringify(['index.html','assets/app.js']));
  runInNewContext(code,{URL,Response,fetch:network,caches:{open},self:{location:{origin:'https://example.com'},addEventListener:(name:string,handler:(e:unknown)=>void)=>handlers.set(name,handler)}});
  const get=async(url:string,mode='navigate')=>{let reply:Promise<Response>|undefined;handlers.get('fetch')!({request:{url,mode,method:'GET'},respondWith:(value:Promise<Response>)=>{reply=value;}});return reply;};
  expect(await (await get('https://example.com/the-fishing/'))!.text()).toBe('new app');expect(open).not.toHaveBeenCalled();expect(network.mock.calls[0][1]).toEqual({cache:'no-store'});
  network.mockRejectedValueOnce(new Error('offline'));expect(await (await get('https://example.com/the-fishing/'))!.text()).toBe('offline app');
  expect(await get('https://api.workers.dev/v1/month?fresh=1','cors')).toBeUndefined();
  expect(await get('https://example.com/the-fishing/v1/month','cors')).toBeUndefined();expect(network).toHaveBeenCalledTimes(2);
});
