# 내 출조 달력 — 서버 없는 A안

선박 티어와 저장한 출조 기록을 휴대전화에서 읽는 정적 PWA입니다. PC를 켜 두거나 Python 수집 서버를 운영할 필요가 없습니다. 사용자의 요청에 따라 **실시간 더피싱 조회는 비활성화**했습니다. 모든 자료는 가져오기 또는 직접 입력으로 추가하고 이 브라우저의 IndexedDB에 저장합니다.

정적 HTTPS 호스팅 대상: https://thefishing-offline-calendar-20261021.cgs-plan-9306.chatgpt.site

Sites의 기본 소유자 전용 공개 범위를 사용합니다. 휴대전화에서 소유자 계정 로그인이 필요할 수 있습니다. 이 로그인은 호스팅 접근 제어이며 PWA의 중앙 관리자 계정이나 더피싱 로그인 기능이 아닙니다. 실제 배포 완료 상태는 프로젝트의 `release/MOBILE_A_DELIVERY.json`과 최종 안내를 확인하세요.

**현재 배포 상태: 미완료.** 등록 성공 후 쓰기 자격 증명 갱신과 프로젝트 조회가 `Sites project not found`로 실패했고 현재 연결의 사이트 목록은 비어 있습니다. 등록된 주소는 접속 가능한 배포 완료 주소가 아닙니다. 사용자는 계정·워크스페이스를 변경하지 않았다고 확인했습니다. 재조회에서도 같은 NOT_FOUND와 빈 사이트 목록이 반환됐으며 원인은 미확인입니다. 같은 사이트를 중복 생성하거나 공개 범위를 바꾸지 않았습니다. 기존 프로젝트에 대한 Sites 접근이 복구되면 `.openai/hosting.json`의 기존 project_id를 그대로 사용해 소스 동기화와 게시를 이어가야 합니다.

바로 업로드할 수 있는 `release/THEFISHING_MOBILE_A_STATIC.zip`과 체크섬을 저장소 루트에 준비했습니다. 기존 정적 HTTPS 호스팅을 이용한다면 이 ZIP을 풀어 루트의 `index.html`과 나머지 파일을 함께 업로드하세요. 이 ZIP은 루트 `/` 배포용입니다.

## 사용하는 순서

1. HTTPS 주소를 열고 `JSON 가져오기`에서 PC의 `state/boat_catalog.json`, `state/monthly_calendar_preferences.json`, `state/monthly_availability_cache.json`의 사본을 선택합니다. 여러 파일을 함께 선택할 수 있습니다. 개인 자격 증명·쿠키·예약 신청자·로그 파일은 선택하지 마세요.
2. `내 선박 관리`에서 달력에 표시할 선박을 선택합니다. 티어 1·2·3·기타, 위·아래 순서, 이름과 항구를 편집할 수 있습니다. 삭제 직후에는 되돌릴 수 있습니다. 추가하려면 실제 선박의 숫자 UID가 필요합니다. UID를 모르면 저장된 목록을 가져오세요.
3. 월과 티어를 고르고 날짜를 누릅니다. 날짜별 기록은 티어 순서로 표시합니다. 항구·출항 시각·잔여석·관측 시각은 저장 자료에 있는 값만 표시합니다. `공식 페이지`는 안전하게 검증된 상세 주소만 새 탭으로 엽니다.
4. `백업 저장`으로 JSON을 내려받습니다. 다른 기기에서는 이 파일을 다시 가져옵니다. 기기 간 자동 동기화는 없습니다. 브라우저 저장소를 지우거나 주소·프로필을 바꾸면 같은 자료가 보이지 않습니다.
5. 실제 자료가 없으면 `예시 둘러보기`로 가상 기록을 볼 수 있습니다. 예시 선박은 실제 UID나 공식 링크가 없으며 저장·백업 자료에 섞이지 않습니다.

가져온 값은 과거 관측입니다. `이전 자료`, `미검증`, `확인 불가`, `접근 제한`을 구분하며 기록이 없다는 이유로 마감이라고 표시하지 않습니다. 새로 고침으로 운영 사이트를 조회하지 않습니다. 사용자 파일의 알려진 자료 필드만 가져오며 연락처 모양의 문자열은 가립니다. 선박 이름 등의 자유 입력에 개인정보를 적지 마세요.

## 설치와 오프라인

한 번 정상 로드하면 앱 화면과 정적 리소스를 서비스 워커에 저장합니다. 같은 브라우저·주소에서 오프라인으로 다시 열 수 있습니다. Android Chrome의 메뉴에서 설치 또는 홈 화면 추가, iOS Safari의 공유 메뉴에서 홈 화면 추가를 사용할 수 있습니다. 실제 단말의 설치 메뉴·호스팅 인증·저장소 정책은 이번 작업에서 직접 검증하지 않았습니다.

새 버전은 새 정적 파일 해시로 캐시를 갱신하고 이전 앱 캐시만 정리합니다. 가져온 자료를 보관하는 IndexedDB는 지우지 않습니다. 앱을 닫은 상태의 백그라운드 수집·예약·알림은 제공하지 않습니다.

## 빌드와 검증

현재 잠금 파일은 pnpm 10.28.2를 사용합니다. Node가 설치된 환경에서 `mobile_pwa`를 작업 폴더로 사용하세요.

```text
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm run preview -- --host 127.0.0.1
```

`dist/`가 완성된 정적 웹 배포물입니다. 서버 코드·데이터베이스·클라우드 수집 함수가 없습니다. 루트에 배포할 때 기본 base는 `/`입니다. GitHub Pages 저장소 경로처럼 `/thefishing/`에 배포하려면 PowerShell에서 다음과 같이 빌드합니다.

```powershell
$env:PWA_BASE='/thefishing/'
pnpm run build
```

루트 배포로 돌아갈 때는 `PWA_BASE`를 `/`로 설정하고 다시 빌드합니다. HTML, JS, CSS, 매니페스트, 아이콘, 서비스 워커를 포함한 `dist` 전체를 그대로 올리세요. 다른 출처로 자산을 분산하면 현재 CSP와 맞지 않습니다. 정적 호스팅의 HTTPS를 사용하세요.

현재 Windows 작업 폴더에서 npm이 PATH에 없을 때는 `dist`를 만든 다음 저장소 루트에서 `.venv\Scripts\python.exe -m http.server 4173 --bind 127.0.0.1 --directory mobile_pwa/dist`로 임시 로컬 확인이 가능합니다. 이것은 개발 미리보기이며 휴대전화 사용에 PC 서버를 요구하는 제품 구조가 아닙니다.

브라우저 테스트는 저장소 루트에서 실행합니다.

```text
python -m pytest -q --offline tests/test_offline_pwa_browser.py tests/test_mobile_pwa_mvp_browser.py tests/test_mobile_pwa_cors_browser.py
```

별도의 하위 경로 테스트는 `/thefishing/` base로 빌드한 뒤 `tests/test_mobile_pwa_subpath_browser.py`를 실행합니다. 이 테스트들은 로컬 주소만 사용합니다. `pnpm test`는 TypeScript 단위 테스트이며, 브라우저 검증은 위 Python Playwright 테스트가 담당합니다.

## 실시간 조회에 관한 제한

`src/provider.ts`의 `LIVE_ENABLED=false`와 `src/providers/thefishingDirect.ts`의 네트워크 없는 공급자로 차단합니다. UI 설정·가져온 JSON으로 이를 켤 수 없습니다. 프로덕션 번들에는 `fetch`, XMLHttpRequest, WebSocket 수집 경로가 없으며 CSP는 같은 출처의 연결만 허용합니다. 서비스 워커의 fetch는 정확한 정적 자산과 화면 캐시에만 사용합니다.

실시간 도입에는 서면 운영자 허가, 실제 HTTPS PWA Origin의 GET·승인된 달력 POST·preflight·인증·쿠키 확인, 실제 Android Chrome·iOS Safari 검증과 파서 검증이 모두 필요합니다. 지금은 이 조건들이 충족되지 않았습니다. 별도의 승인 작업 없이 수집 코드·프록시·릴레이·비밀 키를 추가하지 마세요. 자세한 상태는 `ACCESS_FEASIBILITY_REPORT_KO.md`에 있습니다.
