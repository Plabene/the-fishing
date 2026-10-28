import { el, sourceLink } from './dayView';
import type { LiveRow } from './liveQuery';
import {platformBadge,boatPlatform,PLATFORM_LABELS} from './platforms';
import {bookingAlias} from './bookingAliases';

const stageLabel={detail:'선박 상세 요청',calendar:'월 달력 요청',api:'조회 API 연결'};
export function diagnosticStatus(status:LiveRow['result']['status']):string {
  return ({ALLOWED_READABLE:'조회 완료',UNSUPPORTED_SOURCE:'예약표 미연동',UNVERIFIED:'원본 정보 미확인',PARSER_UNSUPPORTED:'일정 형식 확인 실패',TIMEOUT:'응답 시간 초과',NETWORK_OR_CORS:'통신 실패',HTTP_ERROR:'원본 응답 오류',ACCESS_RESTRICTED:'접근 제한',AUTH_OR_COOKIE_BLOCKED:'인증 필요',PERMISSION_DENIED:'자동 조회 제한',API_BUSY:'조회 대기 필요',API_UNAVAILABLE:'조회 API 오류',API_NOT_CONFIGURED:'조회 API 미설정',CANCELLED:'조회 취소',CORS_DENIED:'브라우저 접근 제한'} as const)[status];
}
export function diagnosticReport(rows:LiveRow[],month:string,now=new Date()):string {
  return [`월별 조회 진단 · ${now.toISOString()}`,`조회 월: ${month}`,...rows.map(({boat,result})=>[
    PLATFORM_LABELS[boatPlatform(boat)],boat.name,`UID ${boat.uid}`,result.stage ? stageLabel[result.stage] : '조회 결과',result.status,
    result.httpStatus ? `HTTP ${result.httpStatus}` : 'HTTP 코드 미수신',diagnosticStatus(result.status),result.message,
  ].join(' · '))].join('\n');
}
export function renderDiagnostics(target:HTMLElement,rows:LiveRow[]):void {
  target.replaceChildren();
  if(rows.some(row=>boatPlatform(row.boat)==='sunsang24' && row.result.status==='PERMISSION_DENIED')) {
    const notice=el('div','','query-help');
    notice.append(el('strong','해당 선사의 자동 조회가 제한되어 있습니다.'),el('p','원본 사이트의 접근 정책으로 이 선사의 새 일정·잔여석을 확인할 수 없습니다. 아래 공식 예약 페이지에서 확인하세요. 다른 선사의 조회는 계속 진행합니다.'));
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
    row.append(el('p',`${boat.name} · ${diagnosticStatus(result.status)} · ${result.message}`,result.status==='ALLOWED_READABLE' ? 'live-ok':'live-failure'));
    if(result.status!=='ALLOWED_READABLE' && result.stage && !['PERMISSION_DENIED','UNSUPPORTED_SOURCE'].includes(result.status)) row.append(el('small',`실패 단계: ${stageLabel[result.stage]}${result.httpStatus ? ` · HTTP ${result.httpStatus}` : ''}`));
    if(result.status!=='ALLOWED_READABLE') {
      const link=sourceLink(bookingAlias(boat.uid)?.url || boat.url,boat.uid);
      if(link) {link.textContent=`${boat.name} 공식 달력 확인 ↗`;link.className='button';row.append(link);}
    }
    target.append(row);
  }
}
