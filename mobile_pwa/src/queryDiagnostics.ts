import { el, sourceLink } from './dayView';
import type { LiveRow } from './liveQuery';
import {platformBadge,boatPlatform,PLATFORM_LABELS} from './platforms';

const stageLabel={detail:'선박 상세 요청',calendar:'월 달력 요청',api:'조회 API 연결'};
export function diagnosticReport(rows:LiveRow[],month:string,now=new Date()):string {
  return [`월별 조회 진단 · ${now.toISOString()}`,`조회 월: ${month}`,...rows.map(({boat,result})=>[
    PLATFORM_LABELS[boatPlatform(boat)],boat.name,`UID ${boat.uid}`,result.stage ? stageLabel[result.stage] : '조회 결과',result.status,
    result.httpStatus ? `HTTP ${result.httpStatus}` : 'HTTP 상태 확인 불가',result.message,
  ].join(' · '))].join('\n');
}
export function renderDiagnostics(target:HTMLElement,rows:LiveRow[]):void {
  target.replaceChildren();
  if(rows.some(row=>boatPlatform(row.boat)==='sunsang24' && row.result.status==='PERMISSION_DENIED')) {
    const notice=el('div','','query-help');
    notice.append(el('strong','선상24 실시간 연동 준비가 필요합니다.'),el('p','현재 선상24는 저장된 선박 목록과 티어만 연결되어 있습니다. 앱 설정에서 실시간 요청을 실행하지 않으므로 다시 조회해도 새 일정·잔여석이 수집되지 않습니다. 아래 공식 예약 페이지에서 확인하세요.'));
    const guide=el('a','운영자용 API 연동 안내 ↗');guide.href='https://github.com/Plabene/the-fishing/blob/main/mobile_pwa/availability_api/README_KO.md#선상24-api-연동-진단과-신청';guide.target='_blank';guide.rel='noopener noreferrer';notice.append(guide);target.append(notice);
  }
  if(rows.some(row=>row.result.status==='NETWORK_OR_CORS' || row.result.status==='CORS_DENIED')) {
    const notice=el('div','','query-help');
    notice.append(el('strong','웹앱에서 원본 응답을 읽지 못했습니다.'),el('p','공식 사이트가 열리더라도 웹앱의 직접 조회는 제한될 수 있습니다. 아래 공식 페이지에서 조회 월을 선택해 확인하세요. 앱 안에서 통합 조회하려면 조회 API 연결이 필요합니다.'));
    target.append(notice);
  }
  for(const {boat,result} of rows) {
    const row=el('div','','diagnostic-row');
    row.append(platformBadge(boat));
    row.append(el('p',`${boat.name} · ${result.message}`,result.status==='ALLOWED_READABLE' ? 'live-ok':'live-failure'));
    if(result.stage && !['PERMISSION_DENIED','UNSUPPORTED_SOURCE'].includes(result.status)) row.append(el('small',`실패 단계: ${stageLabel[result.stage]}${result.httpStatus ? ` · HTTP ${result.httpStatus}` : ' · HTTP 상태 확인 불가'}`));
    if(result.status!=='ALLOWED_READABLE') {
      const link=sourceLink(boat.url,boat.uid);
      if(link) {link.textContent=`${boat.name} 공식 달력 확인 ↗`;link.className='button';row.append(link);}
    }
    target.append(row);
  }
}
