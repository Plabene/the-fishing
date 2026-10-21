# TheFishing 모바일 출조 달력

저장소: https://github.com/Plabene/the-fishing

GitHub Pages: https://plabene.github.io/the-fishing/

이 저장소는 `mobile_pwa` 정적 웹앱의 개발용 저장소입니다. 실시간 더피싱 조회와 자동 예약은 비활성화되어 있습니다. 가져온 자료는 기기의 브라우저에 저장됩니다.

## PC 선박 목록 승계

2026-10-21에 PC에 저장된 기본 선박 506척과 활성 외부 선박 5척·소속 선박 1척을 포함한 512척을 기본 목록으로 반영했습니다. 선택한 83척과 1티어 10척·2티어 10척·3티어 20척·기타 43척의 순서를 유지합니다. 한글 식별자를 쓰는 팀베테랑호와 외부 사이트를 쓰는 팀한프로도 포함합니다.

처음 방문하거나 이전 버전에서 비어 있던 기기는 자동으로 기본 목록을 받습니다. 이미 선박을 편집한 기기는 기존 자료를 유지합니다. `PC 선박 목록 적용`으로 PC 기본 선택·티어를 다시 적용할 수 있으며, 기존 출조 기록과 직접 추가한 선박은 유지하고 바로 되돌릴 수 있습니다. 이후 PC 변경사항이 자동 동기화되지는 않습니다.

기본 목록의 선박명·항구·공식 URL·선택·티어는 정적 웹앱에 포함되어 사이트 방문자에게 보입니다. 쿠키·연락처·예약 신청자·PC 경로·이전 좌석 캐시는 기본 자료에 넣지 않습니다. 기기에서 편집하거나 가져온 자료는 해당 브라우저에만 저장됩니다.

`현재 예약 상황 확인`에서 선택 선박의 공식 예약 페이지를 새 탭으로 열 수 있습니다. 이는 앱 안에서 실시간 잔여석을 수집하는 기능이 아닙니다. 사용자가 운영자 허가·공식 API가 없다고 재확인했으므로 자동 조회는 계속 비활성화합니다. 추후 운영자 허용 범위와 배포 출처 `https://plabene.github.io`에서의 CORS·인증·모바일 검증이 필요합니다.

PC 목록을 나중에 다시 반영할 때는 명시적으로 원본 state 경로를 지정합니다. 아래 도구는 지정된 4개 목록·설정 파일에서 허용 필드만 추출하고, 새 외부 출처가 발견되면 검토 없이 포함하지 않습니다.

```powershell
.\mobile.cmd exec node scripts/sync-fleet.mjs 'PC 프로그램 폴더\state'
.\mobile.cmd test
.\mobile.cmd run build
```

## Windows 개발 환경

Codex에서 `D:\the-fishing` 폴더를 프로젝트로 열고 작업합니다. Node.js 24와 잠금 파일에 지정된 pnpm 10.28.2를 사용합니다. `mobile.cmd`는 Codex에 포함된 런타임을 먼저 사용하며, 없으면 PATH에 설치된 Node.js와 pnpm을 사용합니다. 명령은 자동으로 `mobile_pwa`에서 실행됩니다.

PowerShell에서:

```powershell
Set-Location 'D:\the-fishing'
.\mobile.cmd install --frozen-lockfile
.\mobile.cmd test
.\mobile.cmd run build
.\mobile.cmd run preview --port 4173 --strictPort
```

마지막 명령이 실행 중일 때 http://127.0.0.1:4173 에서 완성된 화면을 확인합니다. `Ctrl+C`로 종료합니다. 소스를 수정한 뒤에는 다시 빌드하고 화면을 새로 고칩니다. 이 미리보기는 로컬 PC 개발용입니다.

GitHub Pages와 같은 경로로 검증하려면 빌드와 미리보기 실행 전에 다음 값을 설정하고 http://127.0.0.1:4173/the-fishing/ 에 접속합니다.

```powershell
$env:PWA_BASE='/the-fishing/'
```

루트 주소의 로컬 미리보기로 돌아가려면 `$env:PWA_BASE='/'`로 설정하고 다시 빌드합니다.

## 수정과 배포

주로 `mobile_pwa/src`를 수정하고, 아이콘과 서비스 워커 등 정적 파일은 `mobile_pwa/public`에서 관리합니다. `dist`는 자동 생성된 빌드 결과입니다. 기존에 업로드했던 `dist`는 Git 추적에서 제외했습니다. GitHub Actions가 소스에서 새로 빌드하므로 생성 파일을 직접 업로드하지 않습니다.

작업 전 Git 상태와 원격 변경 내용을 확인하고, 수정 후 테스트·빌드와 변경 내용을 검토합니다. `.github/workflows/deploy.yml`은 `main`에 푸시되면 새로 빌드하여 GitHub Pages에 배포합니다. 개발 환경 준비만으로 원격 저장소나 배포 사이트가 바뀌지는 않습니다.

이 폴더에서 커밋할 Git 작성자 이름·이메일이 아직 설정되지 않았다면 본인의 정보를 저장소 범위로 설정하세요. 푸시 인증은 GitHub 연결과 별도로 Git Credential Manager 로그인 여부에 따라 필요할 수 있습니다.

```powershell
git config --local user.name '본인 이름'
git config --local user.email '본인 GitHub 이메일 또는 GitHub 비공개 이메일'
```

PC 원본 프로젝트의 개인 자료·쿠키·로그를 이 공개 저장소에 복사할 필요는 없습니다. 앱 사용 안내는 [mobile_pwa/README_MOBILE_A_KO.md](mobile_pwa/README_MOBILE_A_KO.md)를 참고하세요. 해당 문서의 Sites 배포 기록과 원본 Python 테스트 경로는 이전 PC 프로젝트에 관한 내용이며, 현재 모바일 저장소의 개발·배포 절차는 이 문서를 따릅니다.
