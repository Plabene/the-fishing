# 직접 조회 접근 가능성 및 오프라인 MVP 검증

작성일: 2026-10-21 KST. 현재 열린 2.21.0 프로젝트의 `mobile_pwa`를 확장했습니다. 문서가 언급한 예전 ZIP으로 현재 소스를 덮어쓰지 않았습니다. PC 모니터의 401·403·429 중단 처리와 예약 실행 정책은 변경하지 않았습니다.

사용자는 실제 공개 선박 URL과 운영자 서면 허가가 현재 없다고 답하고 **오프라인 PWA 진행**을 선택했습니다. 따라서 운영 사이트 GET·OPTIONS·POST·쿠키 진단은 실행하지 않았습니다. 허가가 없다는 사실을 CORS 기술적 거부의 증거로 취급하지 않습니다.

## 접근 게이트

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 운영자 서면 허가 | UNVERIFIED | 제출된 허가 없음. 프로덕션 실시간 사용 승인 불가 |
| 실제 공개 선박 UID·상세 URL | UNVERIFIED | 사용자 제공 없음. 실제 UID를 추측하지 않음 |
| 실제 정적 HTTPS Origin | VERIFIED | Sites 등록 응답: `https://thefishing-offline-calendar-20261021.cgs-plan-9306.chatgpt.site`. 배포 완료 자체는 별도 결과 파일로 확인 |
| 해당 Origin의 실제 GET 응답 본문 열람 | UNVERIFIED | 운영 사이트 요청 없음 |
| 해당 Origin의 OPTIONS 및 승인된 달력 POST | UNVERIFIED | 운영 사이트 요청 없음 |
| 실제 세션·SameSite·모바일 쿠키 정책 | UNVERIFIED | 쿠키 진단에 대한 별도 허가와 실제 단말 없음 |
| 실제 Android Chrome·iOS Safari | UNVERIFIED | 실제 기기 설치·교차 출처 조회·인증 테스트 미실행 |
| 운영 사이트 HTML 파서 | UNVERIFIED | 허가된 정상 응답 없음. BeautifulSoup 코드를 검증 없이 이식하지 않음 |
| 프로덕션 직접 조회 공급자 | BLOCKED | `LIVE_ENABLED=false`, 네트워크 없는 공급자, 설정·백업으로 해제 불가 |
| 오프라인·가져오기 MVP | VERIFIED | 단위 38개, 실제 Windows Chromium 브라우저 13개, 하위 경로 1개 통과 |
| 실제 HTTPS 게시 | BLOCKED | 등록 후 credential 갱신·get_site가 NOT_FOUND, 현재 list_sites는 빈 목록. 게시 요청까지 도달하지 못함 |

최종 라이브 상태는 `UNVERIFIED`, 사용 가능 여부는 비활성화입니다. `ALLOWED_READABLE`, `CORS_DENIED`, `AUTH_OR_COOKIE_BLOCKED`, `ACCESS_RESTRICTED`, `PARSER_UNSUPPORTED`, `PERMISSION_DENIED`를 별도 값으로 정의했습니다. 원인을 감출 수 있는 브라우저 TypeError만으로 CORS 또는 인증 실패를 단정하지 않습니다. 게이트 함수는 서면 허가, Origin 일치, GET·POST·preflight·쿠키·양대 모바일 브라우저·파서 검증을 모두 요구하지만 이 배포본에는 네트워크 전송 구현이 없습니다.

문서에서 참조한 Python·HTML probe와 companion README는 첨부 파일 및 확인한 Downloads 목록에 제공되지 않았습니다. 대체 파일을 같은 이름으로 만들어 실제 검증 결과처럼 취급하지 않았습니다. 허가와 자료가 없으므로 현재 오프라인 구현에는 필요하지 않습니다.

## 로컬에서 검증한 내용

Windows, Python 3.13의 설치된 Playwright Chromium, Node 24.19.0 환경을 사용했습니다. `--offline`으로 비로컬 연결을 차단했고, PWA 테스트는 실제 HTTP 루프백 서버에서 실행했습니다. 과거 문서의 관리자에 의한 Chromium 차단은 이번 실행에서 발생하지 않았습니다. 데스크톱 모바일 크기 검증을 실제 Android·iOS 검증으로 표시하지 않습니다.

| 검증 | 결과 |
| --- | --- |
| TypeScript 단위 | 38 passed: 4티어 순서·선택 멤버십, 중복/누락 UID, 순서 이동, 삭제, 과거 관측, 실패, 연락처 제외, URL 검증, 취소, 게이트 |
| TypeScript·Vite·번들 검사 | PASS. 수집 전송 API 없음, 같은 출처 CSP |
| 화면·가져오기·오프라인·CORS | 13 passed in 20.75s. 390·1280px 편집/백업/XSS, 320·375·768px 넘침, 서비스 워커, 오프라인 재열기 |
| `/thefishing/` 정적 경로 | 1 passed in 1.74s. base 자산·서비스 워커 scope·이전 앱 캐시 정리·오프라인 재열기 |

루프백의 다른 포트를 다른 Origin으로 사용해 다음 브라우저 동작을 관찰했습니다. 응답 헤더나 상태가 JS에 보이지 않는 실패는 실제 서비스의 원인 추정 근거가 아닙니다.

| 모의 응답 | 실제 브라우저 결과 |
| --- | --- |
| ACAO 없음 | JS 본문·상태 접근 실패 |
| 명시적 Origin 허용 | GET 본문·200 상태 접근 성공 |
| POST 및 X-Requested-With 허용 | OPTIONS 후 POST·본문 열람 성공 |
| preflight에서 X-Requested-With 누락 | POST 전 차단, 추가 POST 없음 |
| credentials include와 ACAO wildcard | 응답 열람 실패 |
| CORS 허용 401·403·429 | 실제 상태 그대로 보임; 자동 재시도 없음 |
| 다른 사이트 문맥의 SameSite=Strict 쿠키 | include 요청에도 쿠키가 전송되지 않음; 익명 성공을 인증 성공으로 간주하지 않음 |

로그: 저장소의 `artifacts/mobile_a_browser_validation.log`, `artifacts/mobile_a_subpath_validation.log`. 화면: `artifacts/mobile_a_390.png`, `artifacts/mobile_a_1280.png`. 소스 ZIP에는 로그·화면·개인 상태를 넣지 않습니다.

최종 소스를 새 임시 폴더에 풀고 pnpm 10.28.2로 잠금 파일에 맞춰 의존성을 설치했습니다. 개발 도구 설치 시 npm 레지스트리를 사용했으며 운영 사이트에는 접속하지 않았습니다. 이 환경의 단위 테스트 38개와 빌드가 통과했고 정적 파일 9개가 원래 빌드와 바이트 단위로 일치했습니다. 이어서 `--offline`으로 PC 핵심 회귀와 PWA 브라우저 검사 **82 passed, 22 subtests passed in 19.98s**를 확인했습니다. 최초 집중 실행에서 드러난 테스트용 Tk 클래스 교체 순서 문제는 `conftest.py`에서 앱 클래스 정의를 먼저 읽도록 보완했고, 관련 추가 회귀 **66 passed**도 확인했습니다. 테스트 집합은 중복되므로 합산하지 않습니다. 기록은 `artifacts/mobile_a_fresh_validation.log`입니다.

최종 소스 ZIP은 항목 322개이며 루트 Python 파일 89개의 원본 해시를 대조했습니다. 비밀 패턴 0, 테스트 밖 전화번호 패턴 0, 역슬래시 ZIP 경로 0, 새 압축 해제 컴파일 및 독립 재압축 2회 동일 해시를 확인했습니다. 합성 전화번호를 사용하는 테스트 파일은 PII 스캔 제외 범위이며 비밀 패턴 검사는 계속 적용합니다. 정적 배포 ZIP도 원본 파일 대조와 결정적 재생성을 통과했습니다. 체크섬은 `release`의 각 `.sha256.txt`에 있습니다.

Sites 등록 ID는 `appgprj_6ad85526bef48191837e68e56efb237e`로 보존했습니다. 이후 현재 연결에서 해당 ID가 404 NOT_FOUND였고 사이트 목록이 비어 있어 소스 push와 게시를 수행하지 못했습니다. 이는 운영 사이트의 403이나 CORS 문제와 별개의 호스팅 연결 문제입니다. 사용자는 계정·워크스페이스를 변경하지 않았다고 확인했습니다. 그 답변 후 기존 ID와 사이트 목록을 다시 조회했으나 동일한 NOT_FOUND·빈 목록이 반환됐습니다. 계정 변경을 원인으로 보지 않으며 Sites 프로젝트 조회 실패의 원인은 미확인입니다. HTTPS에서의 서비스 워커·실제 휴대전화 설치도 미검증으로 남습니다.

## 구현과 보안 범위

- `models.ts`, `importLegacy.ts`, `tierStore.ts`: 허용 필드만 가져오기, 4티어 정규화·중복 제거, 선택 목록 별도 보존, 예전 데이터 호환, 안전한 공식 HTTPS 링크, 연락처 형태 가림.
- `calendarView.ts`, `dayView.ts`, `main.ts`: 월·선택일·티어 필터, 기록상 잔여석과 관측 시각, 선박 편집·순서·선택·삭제 되돌리기, 가져오기 취소와 원자적 IndexedDB 저장. 외부 텍스트는 textContent로 출력.
- `provider.ts`, `providers/thefishingDirect.ts`: 직접 조회 비활성 상태와 근거 분류. 네트워크·파서·POST 구현을 갖춘 활성 공급자가 아님.
- `providers/fixtures.ts`: `demo-` UID만 사용하는 가상 예시. 실제 데이터·기기 저장·백업에 혼합하지 않음.
- `public/sw.js`, `scripts/finalize-build.mjs`: 빌드별 정적 앱 캐시. 원격 HTML·인증 응답·가져온 JSON을 Cache Storage에 저장하지 않음. 아이콘은 이 작업에서 만든 단순 도형으로 외부 라이선스 자산 없음.

새 backend·프록시·클라우드 수집 함수·중앙 저장소는 없습니다. 예약·신청자·자동 로그인·결제·최종 제출·예약 스케줄러 Python 코드는 모바일 의존성에 들어가지 않습니다. 사용자 실제 state 파일을 배포물에 복사하지 않았습니다. 연락처 정규식과 허용 필드는 알려진 유형을 제한하지만 자유 입력에 임의로 넣은 모든 개인정보를 식별하는 인증은 아닙니다.

## 남은 실서비스 확인

오프라인 MVP는 완료 범위입니다. 실시간 연동은 운영자의 공식 API 또는 승인 경로와 요청 정책부터 별도 확인해야 합니다. 같은 PWA Origin에서 GET 및 승인된 읽기 전용 POST를 각 1회 검증하고, 필요할 때만 사용자가 승인한 credentials 진단을 수행해야 합니다. 401·403·429·보안 응답이면 중단하며 우회하지 않습니다. 활성 공급자를 개발할 때도 10분을 넘는 보수적인 갱신 간격과 요청 직렬화·취소·타임아웃·실패 상태가 필요합니다. 서버가 없는 구조에서 여러 휴대전화의 요청을 전역 조정할 수 없다는 제한이 남습니다.
