// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { diagnosticReport, renderDiagnostics } from '../src/queryDiagnostics';
import type { LiveRow } from '../src/liveQuery';
const failed:LiveRow={boat:{uid:'6130',name:'검증 선박',port:'',url:'https://thefishing.kr/reservation/list.php?uid=6130'},result:{status:'NETWORK_OR_CORS',stage:'detail',message:'응답을 읽지 못했습니다.',events:[]}};
test('an unreadable response provides a working official link and does not invent an HTTP code',()=>{
  const target=document.createElement('div');renderDiagnostics(target,[failed]);
  expect(target.textContent).toContain('조회 API 연결');
  expect(target.textContent).toContain('선박 상세 요청');
  expect(target.textContent).toContain('통신 실패');
  expect(target.textContent).not.toContain('HTTP 상태 확인 불가');
  expect(target.querySelector('a')?.href).toBe(failed.boat.url);
  expect(target.querySelector('a')?.rel).toContain('noopener');
  const report=diagnosticReport([failed],'2026-10',new Date('2026-10-21T13:00:00Z'));
  expect(report).toContain('조회 월: 2026-10');expect(report).toContain('NETWORK_OR_CORS');
  expect(report).not.toContain('HTTP 403');
});

test('successful rows never render a failure stage and unlinked rows explain missing connection',()=>{
  const target=document.createElement('div');
  renderDiagnostics(target,[{...failed,result:{status:'ALLOWED_READABLE',stage:'calendar',events:[],message:'일정 없음'}},{...failed,result:{status:'UNSUPPORTED_SOURCE',stage:'api',events:[],message:'공개 주소 확인 필요'}}]);
  expect(target.textContent).toContain('조회 완료');expect(target.textContent).toContain('예약표 미연동');expect(target.textContent).not.toContain('실패 단계');
});
test('an HTTP failure keeps its exact stage and renders source text without HTML execution',()=>{
  const target=document.createElement('div');
  renderDiagnostics(target,[{...failed,boat:{...failed.boat,name:'<img src=x>'},result:{...failed.result,status:'HTTP_ERROR',httpStatus:404,stage:'calendar'}}]);
  expect(target.textContent).toContain('월 달력 요청 · HTTP 404');
  expect(target.querySelector('img')).toBeNull();
});
test('restricted Sunsang homepage explains host-specific policy and links to guidance',()=>{
  const target=document.createElement('div');
  renderDiagnostics(target,[{boat:{uid:'sunsang24:ship:698',name:'자연피싱호',port:'',url:'https://www.sunsang24.com/ship/list?ship_no=698'},result:{status:'PERMISSION_DENIED',stage:'api',events:[],message:'연동 이용 허가 확인 필요'}}]);
  expect(target.textContent).toContain('자동 조회가 제한');expect(target.textContent).toContain('다른 선사의 조회는 계속');
  expect(target.querySelector('.query-help a')?.getAttribute('href')).toContain('availability_api/README_KO.md#');
  expect(target.querySelector('.diagnostic-row a')?.getAttribute('href')).toContain('ship_no=698');
  expect(target.textContent).not.toContain('HTTP 403');expect(target.textContent).not.toContain('실패 단계:');
});
