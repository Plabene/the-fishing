# 월별 예약 조회 API

GitHub Pages 화면은 그대로 사용하고, Cloudflare Worker가 더피싱의 공개 월 달력을 읽어 검증한 JSON만 반환합니다. PC 상시 실행은 필요하지 않습니다.

## 현재 연결

- 웹앱: https://plabene.github.io/the-fishing/
- API: https://thefishing-availability.thefishing-mobile-a.workers.dev
- 상태 확인: https://thefishing-availability.thefishing-mobile-a.workers.dev/health
- 배포: 2026-10-22 본인 Cloudflare 계정, 어종·병렬 조회 Worker 버전 `d6a5e0c6-6e6f-4ef0-982e-415ee584dbaa`

2026-10-21의 60분 임시 계정 배포는 종료됐습니다. 본인 계정의 OAuth 로그인과 이메일 인증을 완료한 뒤 새로 배포했습니다. 앱 기본 연결을 새 주소로 변경했고, 이전 임시 주소를 저장한 기기도 자동으로 전환합니다. 다른 사용자 지정 주소와 명시적인 연결 해제는 유지합니다.

본인 계정의 실제 클라우드 API에서 2026-10-22 08:01:54 KST에 UID 6130, 2026-10 조회가 성공하여 출조 상품 5개를 반환했습니다. CORS 응답 헤더, 재조회 캐시와 관측 시각 유지도 확인했습니다. 이 결과는 검증한 선박·월에 대한 결과이며 모든 선박의 조회 가능성을 보장하지 않습니다.

## 사용

기본 API가 연결되어 있으므로 **조회 API 사용 → 실시간 월 조회**를 누릅니다. 과거에 직접 연결을 해제했거나 다른 배포를 쓰려면 **조회 API 연결**에서 주소를 입력하고 **연결 확인 및 저장**을 누릅니다. 연결 확인은 `/health` 응답만 확인하며 원본 사이트 조회 성공 여부는 월 조회 결과로 판단합니다.

API 주소는 이 기기에만 저장합니다. 기존 선박 목록·티어·조회 자료는 유지됩니다. API에는 선박 UID와 조회 월만 전송합니다. 클라이언트에는 Cloudflare 토큰·계정 비밀번호·쿠키를 넣지 않습니다.

## 본인 계정 배포

저장소 루트 `D:\the-fishing`에서 실행합니다.

```powershell
.\mobile.cmd exec wrangler login --device --browser=false
.\mobile.cmd run api:check
.\mobile.cmd run api:deploy
```

최초 로그인 또는 인증 만료 시 명령이 출력한 Cloudflare 로그인 URL에서 일회용 코드를 입력하고 사용자가 직접 승인합니다. 코드는 5분 뒤 만료되므로 만료되면 로그인 명령을 다시 실행합니다. 이미 로그인되어 있으면 로그인 명령을 생략합니다. 배포 오류 `10034`는 계정 이메일 인증이 필요하다는 뜻입니다. API 토큰을 채팅이나 저장소에 붙여넣을 필요가 없습니다. 최초 배포 시 계정과 workers.dev 주소 설정을 요청할 수 있습니다. 생성된 `https://서비스명.계정명.workers.dev` 주소를 웹앱에 연결합니다. 모든 기기의 기본 주소를 바꾸려면 `src/data/apiEndpoint.json`의 `url`을 새 주소로 변경하고 GitHub에 반영합니다.

Cloudflare의 요금·사용량 한도는 본인 계정에서 확인하세요. 이 프로젝트는 별도 유료 요금제나 결제를 신청하지 않습니다.

GitHub Actions는 웹앱 테스트·API 빌드 검사·GitHub Pages 배포를 실행합니다. **Worker 소스 변경은 `api:deploy`로 별도 배포해야 합니다.** Cloudflare 계정 자격 증명은 GitHub에 추가하지 않았습니다.

## 조회 범위와 실패 처리

- API는 `/health`, `/v1/month?uid=숫자&month=YYYY-MM` GET만 제공합니다. 임의 URL·헤더·예약 폼을 중계하지 않습니다.
- 원본 요청은 고정된 더피싱 상세 GET 및 발견·검증한 월 달력 POST만 수행합니다. 로그인·예약·결제·쿠키 전송이 없습니다. HTTP 리디렉션을 따르지 않습니다.
- 브라우저 호출 출처는 `https://plabene.github.io`로 제한합니다. CORS는 사용자 인증 수단이 아니므로 서버 측에서도 전역 처리량을 제한합니다.
- Durable Object 하나가 중복 요청을 합치고 최대 3척을 동시에 처리합니다. 원본 요청 시작 간격은 전체 방문자 합산 최소 1초, 각 요청은 10초 제한입니다. 신규 월 조회는 분당 최대 60건이며, 한도 갱신까지 5초 이내이면 잠시 기다려 긴 배치가 중간에 끊기지 않게 합니다. 대기는 최대 9건이며 초과 혼잡에서는 중단 상태를 반환합니다.
- 검증된 선박 UID·달력 경로·st_uid 메타데이터만 최대 256척, 1시간 보관합니다. 다음 월은 상세 GET을 반복하지 않고 달력 POST로 읽습니다. 응답 검증 실패 시 메타데이터를 지워 다음 수동 조회에서 상세 페이지를 다시 확인합니다.
- 성공 자료는 10분 동안 공유 캐시로 재사용하며 원래 조회 시각을 유지합니다. 최대 256개 캐시만 보관하고 원본 HTML은 보관하지 않습니다.
- 웹앱도 현재 화면에서 성공 결과를 같은 관측 시각 기준 10분간 재사용합니다. 최대 3개 API 요청을 병렬 처리하며, 캐시 결과는 다른 선박의 원본 응답을 기다리지 않습니다. 어종 파서 도입 이전의 서버 캐시는 새 자료 캐시와 구분합니다.
- 401/403/429·보안 화면에서는 10분간 중단합니다. 네트워크·시간 초과에서는 30초간 중단합니다. 동일 조건의 실패 결과는 최대 1분 재사용합니다. 실패를 빈 달력 성공으로 표시하지 않습니다.
- 응답 선박·월·숫자 잔여석·관측 시각은 서버와 웹앱에서 검증합니다. 실패한 선박의 기존 기기 자료는 보존합니다.
- 출조명 `trip`과 함께 `speciesKey`·`species`를 반환합니다. PC 파서처럼 가격 요소를 제거하고 상품 링크의 텍스트는 유지합니다. 동일 예약 버튼이 여러 번 있으면 출조 상품 정보가 더 많은 영역을 우선합니다. 예약 링크를 실행하지 않습니다. 기존 클라이언트는 추가 필드를 무시하고 사용할 수 있습니다.

## 검증

```powershell
.\mobile.cmd test
.\mobile.cmd run build
.\mobile.cmd run api:check
```

실제 운영 조회는 테스트에서 자동 실행하지 않습니다. 자동 테스트는 HTTP 응답을 모의 처리합니다. 로컬 API가 필요하면 `api:dev`로 시작하며, 실제 원본 요청은 직접 `/v1/month`를 호출할 때만 실행됩니다.

Cloudflare Worker에서는 `redirect: error`가 지원되지 않아 `manual`로 요청하고 모든 비-200 응답을 실패로 처리합니다. 이 차이는 회귀 테스트와 실제 배포 검증으로 확인했습니다.

참고: [Cloudflare 임시 배포](https://developers.cloudflare.com/changelog/product/workers/3/), [Wrangler 로그인](https://developers.cloudflare.com/workers/wrangler/commands/general/), [Durable Objects](https://developers.cloudflare.com/durable-objects/get-started/).
