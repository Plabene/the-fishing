# 지역 선택과 정기 선박 목록 갱신 검증

## 구현

- `src/regions.ts`, `src/regionFilter.ts`: 권역·시도/지역·세부 지역·출항지의 연계 필터, 전체/미확인, 상위 변경 시 하위 초기화.
- `src/main.ts`, `src/monthlyQuery.ts`, `src/dayView.ts`, `src/monthlyView.ts`, `src/sourceAccess.ts`: API 요청과 모든 결과 화면·선박 관리를 같은 지역으로 제한. 지역 변경 자체는 네트워크 요청을 만들지 않음.
- `src/models.ts`, `src/importLegacy.ts`: PC 지역 필드 승계, 백업·IndexedDB 저장.
- `src/defaultFleet.ts`, `src/data/legacyFleet.json`: 이전 배포 기본값과 현재 개인값을 비교하는 병합. 변경한 이름·항구·지역·URL, 티어·선택·순서, 삭제한 선박 보존. 새 UID만 선택 해제로 추가.
- `scripts/lib/catalog.mjs`, `scripts/update-fleet.mjs`: 광고를 제외한 공개 예약 목록 전체 페이지 수집, UID·URL·페이지·건수 검증, 중복 통합, 상충 필드 보류, 기존 선박 보존, 성공 후 원자적 파일 교체.
- `.github/workflows/deploy.yml`: 월요일 06:17 KST 정기 실행과 `refresh_fleet` 수동 실행. 테스트·빌드 통과 후 봇 커밋과 Pages 배포를 같은 워크플로에서 실행.

기존 API·조회 간격·새 잔여석 확인 방식은 수정하지 않았다. 목록 갱신에는 좌석·예약 내역을 수집하지 않는다.

## 실제 공개 목록 확인

2026-10-22 17:33:56 KST에 완료한 공개 응답 34페이지를 검사했다. 표시/수집 항목은 676개, 중복 제외 UID는 427개, 중복은 249개였다. 이 캡처에서 같은 UID의 필드 충돌은 0개였다. 앞선 실행에서는 UID 5085의 정보 충돌이 관찰되어 해당 실행은 파일을 변경하지 않았다.

원본 페이지 사이에 UID가 반복되므로 **676개 모두의 고유 UID를 수집했다고 확인할 수 없다.** 기존 512개와 합쳐 122개 신규 UID를 추가한 초기 배포 목록은 634개이며 633개에 지역 정보가 있다. 미노출 기존 항목과 외부 항목을 지우지 않는다. 이후 정기 실행의 최신 수치는 `src/data/defaultFleet.json`의 `catalog`와 Actions 실행 요약을 기준으로 확인한다.

## 검증

로컬 자동 테스트 **27개 파일·181개 테스트 통과**. 지역별 API 요청 UID·달력 반영·월 변경·선택 범위, 지역 백업, 기존 개인 설정과 삭제 보존, 신규 미선택, 공개 목록 광고 제외·중복·충돌·부분 실패를 검증했다. 기존 새 잔여석·어종·물때·진행 시간 테스트도 함께 통과했다.

Pages 하위 경로 `/the-fishing/`의 TypeScript·Vite 빌드 및 번들 검사, Worker 배포 dry-run을 통과했다. 번들의 500kB 경고는 남아 있으며 API Worker 자체를 변경하거나 새로 배포하지 않았다. 실제 휴대폰의 화면·설치 동작은 이번에 직접 확인하지 않았다. 이 작업에서 속도 측정치를 새로 만들지 않았다.

예약 실행은 GitHub의 지연·비활성 저장소 정책을 따른다. [예약 이벤트 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)와 [GITHUB_TOKEN 이벤트 제한](https://docs.github.com/en/actions/concepts/security/github_token)에 따라 같은 워크플로 안에서 배포한다.
