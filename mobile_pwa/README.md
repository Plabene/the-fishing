# 더피싱 오프라인 출조 달력

전체 사용·설치·빌드·배포 안내는 [README_MOBILE_A_KO.md](README_MOBILE_A_KO.md), 실제 접근 게이트와 검증 범위는 [ACCESS_FEASIBILITY_REPORT_KO.md](ACCESS_FEASIBILITY_REPORT_KO.md)를 확인하세요.

이 화면은 PC에서 저장한 선박 목록과 월별 조회 캐시를 가져와 기기 안에서 읽습니다. 사이트를 자동 조회하거나 예약하지 않습니다. 가져온 좌석 정보는 항상 이전 자료로 표시합니다.

현재 프로젝트의 `mobile_pwa` 폴더에서 `npm run build`로 빌드한 뒤 `npm run preview -- --host 127.0.0.1`로 로컬 화면을 엽니다. 의존성이 없는 새 환경은 잠금 파일에 맞춰 `pnpm install --frozen-lockfile`을 먼저 실행해야 합니다. 외부 사이트 운영 권한과 별개인 개발 도구 설치 과정입니다. 단위 검증 명령은 `npm test`입니다.

이 작업 폴더에는 검증한 `dist` 빌드도 있습니다. npm이 없는 현재 Windows 환경에서는 `mobile_pwa` 폴더에서 아래 명령으로 열 수 있습니다. 실행 후 [로컬 출조 달력](http://127.0.0.1:4173)을 방문합니다. 소스 ZIP을 새로 푼 환경은 먼저 빌드해야 합니다.

```powershell
..\.venv\Scripts\python.exe -m http.server 4173 --bind 127.0.0.1 --directory dist
```

`JSON 가져오기`에서 PC의 `state/boat_catalog.json`, `state/monthly_calendar_preferences.json`, `state/monthly_availability_cache.json` 또는 이 화면에서 저장한 백업 JSON을 선택합니다. 개인 설정·자격 증명 파일은 가져올 필요가 없습니다. 파일 여러 개를 한꺼번에 선택할 수 있습니다. `백업 저장`은 가져온 기록을 로컬 JSON 파일로 내보냅니다.

한 번 정상 로드한 화면과 자료는 서비스 워커 및 IndexedDB에 저장됩니다. 같은 주소에서 오프라인으로 다시 열 수 있습니다. 브라우저 저장소를 지우면 기기에 보관한 자료가 사라지므로 백업 파일을 별도로 보관하세요. 모바일 기기 설치·배포는 이번 로컬 검증 범위에 포함하지 않습니다.
