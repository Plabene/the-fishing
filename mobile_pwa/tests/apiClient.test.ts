// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { apiOrigin, checkApi, clearApiOrigin, loadApiOrigin, TheFishingApi, validateApiResult } from '../src/providers/thefishingApi';
import { applyLiveResults } from '../src/liveQuery';
import { emptyState } from '../src/models';
const boat={uid:'6130',name:'테스트 선박',port:'항구',url:'https://thefishing.kr/reservation/list.php?uid=6130'};
const valid=()=>{const observedAt=new Date().toISOString();return {status:'ALLOWED_READABLE',observedAt,cached:true,events:[{id:'direct-123456789012345678901234',uid:'6130',date:'2026-10-22',trip:'출조',remaining:4,price:100000,departure:'05:00',observedAt}]};};
afterEach(()=>vi.unstubAllGlobals());
test('default API is ready for use but an explicit disconnect persists across reloads',()=>{
  localStorage.clear();expect(loadApiOrigin()).toBe('https://thefishing-availability.longing-bonobo.workers.dev');
  clearApiOrigin();expect(loadApiOrigin()).toBe('');localStorage.clear();
});
test.each(['http://a.b.workers.dev','https://evil.test','https://127.0.0.1','https://a.b.workers.dev/path','https://u:p@a.b.workers.dev','https://a.b.workers.dev?token=1'])('API endpoint rejects unsafe or unconfigured URL %s',value=>expect(()=>apiOrigin(value)).toThrow());
test('client calls only the configured API and normalizes verified results without sending cookies',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json(valid()));
  const result=await new TheFishingApi('https://fishing.example.workers.dev',request).readMonth(boat,'2026-10',new AbortController().signal);
  expect(result.status).toBe('ALLOWED_READABLE');expect(result.events[0].source).toBe('api');expect(result.events[0].port).toBe('항구');
  expect(request.mock.calls[0][0]).toBe('https://fishing.example.workers.dev/v1/month?uid=6130&month=2026-10');
  expect(request.mock.calls[0][1]?.credentials).toBe('omit');
  expect(applyLiveResults(emptyState(),'2026-10',[{boat,result}]).monthChecks?.[0].source).toBe('api');
});
test('wrong boat, month, timestamp and numeric seats cannot become verified data',()=>{
  for(const patch of [{uid:'1'},{date:'2026-11-01'},{remaining:'4'},{observedAt:'2020-01-01T00:00:00Z'},{id:'javascript:foo'}]) {
    const data=valid();Object.assign(data.events[0],patch);expect(()=>validateApiResult(data,boat,'2026-10')).toThrow();
  }
  const stale=valid();stale.observedAt='2020-01-01T00:00:00Z';expect(()=>validateApiResult(stale,boat,'2026-10')).toThrow();
});
test('health check validates protocol and missing API never triggers external fetch',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({service:'thefishing-availability',schema:1,ready:true}));
  expect(await checkApi('https://fishing.example.workers.dev',request)).toBe('https://fishing.example.workers.dev');
  expect(request.mock.calls[0][0]).toContain('/health');request.mockClear();
  expect((await new TheFishingApi('',request).readMonth(boat,'2026-10',new AbortController().signal)).status).toBe('API_NOT_CONFIGURED');expect(request).not.toHaveBeenCalled();
});
