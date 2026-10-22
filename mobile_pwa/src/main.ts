import './style.css';
import { emptyState, LABELS, TIERS, reservationLink, text, type AppState, type Filter, type Tier } from './models';
import { importData, exportData } from './importLegacy';
import {exportTierBackup,restoreTierBackup,isTierBackup} from './tierBackup';
import {saveJsonFile,canShareJson} from './fileSave';
import {applySunsangTiers,SUNSANG_TIER_COUNT} from './sunsang24Tiers';
import { loadState, saveState } from './availabilityStore';
import { orderedBoats, moveBoat, removeBoat, tierFor } from './tierStore';
import { renderCalendar } from './calendarView';
import { el, renderDay, sourceLink } from './dayView';
import { fixtureState } from './providers/fixtures';
import { TheFishingDirect } from './providers/thefishingDirect';
import { TheFishingApi, loadApiOrigin, saveApiOrigin, clearApiOrigin, checkApi } from './providers/thefishingApi';
import { collectMonth, applyLiveResults, type LiveRow } from './liveQuery';
import { initializeFleet, applyDefaultFleet } from './defaultFleet';
import { renderSourceAccess } from './sourceAccess';
import { initializeMonthlyArchive } from './monthlyArchive';
import { queryMonth } from './monthlyQuery';
import { renderMonthlyList } from './monthlyView';
import { diagnosticReport, renderDiagnostics } from './queryDiagnostics';
import { renderSpeciesFilter } from './speciesFilter';
import { eventSpecies, normalizeSpeciesSelection, speciesLabel } from './species';
import tideArchive from './data/tideArchive.json';
import { calculateTideMonth,mergeTideDays } from './tides';
import { renderTideSummary } from './tideView';
import { readTideMonth } from './providers/tideApi';
import { freshQueryView } from './freshResults';
import { QueryProgress } from './queryProgress';
import { matchesRegion,readRegion,regionLabel,regionSummary } from './regions';
import { renderRegionFilter } from './regionFilter';
import fleetSeed from './data/defaultFleet.json';
import sunsangSeed from './data/sunsang24Fleet.json';
import {boatPlatform,matchesPlatform,platformBadge,readPlatform,PLATFORM_LABELS,possibleDuplicateIds,SUNSANG24_DISABLED_MESSAGE} from './platforms';
import {locationDescription} from './regions';
import {IntegratedProvider,Sunsang24Api} from './providers/sunsang24Api';
const root = document.querySelector<HTMLDivElement>('#app')!;
// Only static markup is inserted here. All imported content uses textContent/value.
root.innerHTML = `<header class="hero"><div class="hero-inner"><div class="brand"><span class="brand-mark" aria-hidden="true">≈</span><span>THEFISHING<small>더피싱 · 선상24 통합 선박 검색</small></span></div><div class="hero-row"><div><p class="eyebrow">출조할 월과 인원을 선택하세요</p><h1>월별 예약 조회</h1><p>선택한 선박의 출조 일정과 잔여석을 날짜별로.</p></div><span id="connectivity"></span></div></div></header>
<main><div class="message-row"><p id="message" role="status" aria-live="polite"></p><button id="cancel" hidden>가져오기 취소</button><button id="undo" hidden>변경 되돌리기</button></div>

<section class="calendar-shell" aria-label="월별 예약 조회"><div class="section-heading"><div><p class="eyebrow dark">월별 출조 일정 · 잔여석</p><h2 id="month-label"></h2></div><span id="source-badge" class="badge status-stale">조회 대기</span></div>
<div class="booking-options"><details id="reservation-filters"><summary>지역·어종·선박 필터 <span id="reservation-filter-summary"></span></summary><label class="platform-control">예약 플랫폼<select id="platform-filter"><option value="all">전체 플랫폼</option><option value="thefishing">더피싱</option><option value="sunsang24">선상24</option></select></label><section id="region-filter" aria-label="지역 선택"></section><div class="filters"><div id="tabs" class="tier-tabs" role="group" aria-label="선박 티어"></div><label class="search-label"><span class="sr-only">선박 또는 어종 검색</span><input id="search" type="search" placeholder="선박 · 항구 · 어종 검색"></label></div><section id="species-filter" aria-label="어종 필터"></section><label class="matching-option"><input id="matching-only" type="checkbox" checked> 조회 당시 인원 충족 일정만</label></details><div class="view-tabs" role="group" aria-label="결과 보기"><button id="view-calendar" aria-pressed="true">달력</button><button id="view-list" aria-pressed="false">월 전체 목록</button></div></div>
<div id="demo-banner" class="demo-banner" hidden>가상의 예시 자료입니다. 실제 선박·잔여석 정보가 아니며 내 자료에 저장되지 않습니다.</div>
<form id="query-form" class="query-controls"><div class="month-controls"><button id="prev" type="button" aria-label="이전 달">‹</button><label class="sr-only" for="month">조회 월</label><input id="month" type="month" min="2000-01" max="2099-12" required><button id="next" type="button" aria-label="다음 달">›</button></div><label class="people-label">출조 인원<input id="people" type="number" min="1" max="100" step="1" required></label><button id="query-submit" class="primary" type="submit">실시간 월 조회</button><button id="stop-query" type="button" hidden>조회 취소</button><div id="query-monitor" class="query-monitor" role="group" aria-label="월별 조회 진행 상태" hidden><div class="query-monitor-heading"><strong id="query-phase"></strong><span id="query-elapsed" aria-live="off"></span></div><progress id="query-bar" max="1" value="0" aria-label="선박 조회 진행률"></progress><p id="query-counts"></p><p id="live-progress" role="status" aria-live="polite"></p></div></form>
<div id="calendar-layout" class="calendar-grid-layout"><div><div id="calendar" class="calendar-grid" aria-label="월별 날짜"></div><p class="legend">날짜별 숫자는 조회 조건에 맞는 출조 상품 수입니다. 한 선박에 여러 상품이 있을 수 있습니다. 이전 잔여석은 현재 예약 가능 여부를 보장하지 않습니다.</p><p id="last-observed" class="timestamp"></p></div><section id="day-view" class="day-view" aria-live="polite"></section></div><section id="month-results" aria-label="월 전체 조회 결과" hidden></section>
<p id="summary" class="summary"></p><div id="query-status" class="query-status" role="status"></div><details id="live-diagnostics" hidden><summary>선박별 조회 결과</summary><div id="live-rows"></div><button id="copy-diagnostics" type="button">조회 진단 복사</button><textarea id="diagnostic-text" readonly hidden aria-label="조회 진단 내용"></textarea></details></section>
<section id="source-access" class="source-access" aria-label="공식 예약 페이지 확인"></section>
<details id="tide-info" class="secondary-panel"><summary>물때 설명 · 새로고침</summary><section class="tide-panel" aria-label="보령 물때"><div id="tide-status"></div><button id="tide-refresh" type="button">물때 새로고침</button></section></details>
<details id="api-settings" class="api-settings secondary-panel"><summary>조회 방식 · API 연결 설정</summary><label class="mode-label">조회 방식<select id="query-mode" form="query-form"><option value="api">조회 API 사용</option><option value="direct">브라우저 직접 조회 (진단용)</option><option value="saved">이전 자료 열람 (예약 판단용 아님)</option></select></label><p>API 연결 · <span id="api-state">연결 안 됨</span></p><form id="api-form"><label>배포된 API 주소<input id="api-url" type="url" required placeholder="https://서비스명.계정명.workers.dev" autocomplete="off"></label><button type="submit">연결 확인 및 저장</button><button id="api-clear" type="button">연결 해제</button></form><p class="query-source">조회 API가 원본 월 달력을 읽고 공개 일정·잔여석만 전달합니다. 조회 버튼을 누를 때마다 원본의 잔여석을 새로 확인하며, 이번에 확인한 선박만 표시합니다.</p><p>API 주소는 이 기기에 저장됩니다. 계정 비밀번호나 토큰은 입력하지 않습니다. 연결 확인은 API 접속 확인이며, 실제 잔여석은 월 조회 결과로 확인합니다.</p><a href="https://github.com/Plabene/the-fishing/blob/main/mobile_pwa/availability_api/README_KO.md" target="_blank" rel="noopener noreferrer">API 배포 안내 ↗</a></details>
<details class="data-tools"><summary>저장된 월별 자료 · 가져오기 · 백업</summary><div id="archive-months" class="archive-months" aria-label="자료가 있는 월"></div><section class="data-bar" aria-label="조회 자료 관리"><div><strong>PC 조회 자료 · 선박 설정</strong><p>PC의 monthly_availability_cache.json을 가져오면 월별 조회 결과를 갱신할 수 있습니다. 설정과 가져온 자료는 이 기기에 저장됩니다.</p></div><div class="actions"><label class="button primary">PC 조회 결과 가져오기<input id="import" type="file" accept=".json,application/json" multiple></label><button id="export">백업 저장</button><button id="demo">예시 둘러보기</button><button id="restore-fleet">기본 목록·티어 복원</button></div></section>
</details>
<section id="fleet-section" class="fleet-section"><div class="section-heading"><div><p class="eyebrow dark">기기별 설정</p><h2>내 선박 관리</h2></div><button id="add-toggle">+ 선박 추가</button></div><p class="muted">조회할 선박을 선택하고 티어와 순서를 바꾸세요. 다른 기기와 자동으로 동기화되지 않습니다.</p><form id="boat-form" class="boat-form" hidden><label>선박 UID<input name="uid" inputmode="numeric" required maxlength="80" placeholder="실제 선박의 숫자 UID"></label><label>선박 이름<input name="name" required maxlength="100"></label><label>항구<input name="port" maxlength="100"></label><label>권역<input name="sea" maxlength="60" placeholder="서해권"></label><label>시·도/지역<input name="province" maxlength="60" placeholder="충청남도"></label><label>세부 지역<input name="local" maxlength="60" placeholder="보령시"></label><label class="url-field">공식 상세 URL (선택)<input name="url" type="url" placeholder="https://thefishing.kr/reservation/list.php?uid=…"></label><label>티어<select name="tier"><option value="tier1">1티어</option><option value="tier2">2티어</option><option value="tier3">3티어</option><option value="other">기타</option></select></label><div class="actions"><button type="submit" class="primary">선박 저장</button><button type="button" id="edit-cancel">닫기</button></div></form><section class="tier-backup" aria-label="선박 티어 백업"><strong>내 티어 목록 보관</strong><p>티어·순서·선택한 선박을 JSON 파일로 저장합니다. 다른 휴대폰에서도 이 파일을 불러올 수 있습니다.</p><div class="actions"><button id="tier-export" type="button">티어 목록 저장</button><button id="tier-share" type="button" hidden>티어 파일 공유</button><label class="button">티어 파일 불러오기<input id="tier-import" type="file" accept=".json,application/json"></label></div><p>파일 공유에서 저장 위치를 선택하세요. 불러오기는 파일에 담긴 선박의 설정만 바꾸며, 다른 선박과 조회 자료는 유지합니다.</p><details><summary>선상24 PC 티어 가져오기</summary><p>PC에 저장된 ${SUNSANG_TIER_COUNT}척을 처음 한 번 적용합니다. 웹에서 이미 지정한 티어는 유지합니다. 다시 적용하면 이 ${SUNSANG_TIER_COUNT}척의 티어와 선택 상태를 PC 기준으로 바꿉니다.</p><button id="restore-sunsang-tiers" type="button">선상24 PC 티어 다시 적용</button></details></section><p id="fleet-catalog-status" class="muted"></p><div class="fleet-tools"><label>목록 검색<input id="fleet-search" type="search" placeholder="이름 또는 UID"></label><span id="fleet-count"></span><button id="select-all">검색된 선박 모두 선택</button><button id="select-none">검색된 선박 모두 해제</button></div><div id="boats"></div></section>
<details class="about"><summary>자료 상태와 오프라인 사용 안내</summary><p><strong>조회 API · 수동 실행</strong></p><p>조회 API가 더피싱 상세 페이지와 월 달력을 읽습니다. API 또는 원본 사이트의 연결 상태에 따라 실패할 수 있습니다. 브라우저 직접 조회는 진단용이며 원본 사이트의 CORS 허용이 필요합니다. 404·접근 제한·응답 해석 실패를 구분하며, 실패를 예약 마감으로 표시하지 않습니다. PC 오류는 모바일의 조회 가능 여부를 결정하지 않습니다. 조회할 때마다 월 달력을 새로 읽으며, 저장된 잔여석을 재사용하지 않습니다.</p><p>한 번 열린 화면과 저장 자료는 오프라인에서 다시 볼 수 있습니다. 브라우저 저장소를 지우면 자료가 사라지므로 백업을 보관하세요. 앱을 닫은 상태의 자동 새로고침은 제공하지 않습니다.</p><p>관리 기능은 이 기기의 설정입니다. 중앙 관리자 계정과 기기 간 자동 동기화는 없습니다. 공식 페이지 링크는 새 탭에서 열립니다.</p></details></main><footer>월별 예약 조회 · 조회 자료와 기준 시각 표시<span>예약·로그인·결제 기능 없음</span></footer>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let state = emptyState(), tier: Filter = 'all', search = '', fleetSearch = '', demo = false;
let selectedDay = `${state.month}-01`, busy = false, editing: string | null = null;
let sourceBoat = '', matchingOnly=true, listView=false, resultLimit=50;
let importController: AbortController | null = null, undoState: AppState | null = null;
let liveController:AbortController|null=null; const directProvider=new TheFishingDirect();
let liveRows:LiveRow[]=[], liveMonth=state.month;
let livePreview:AppState|null=null;
let configuredApi=loadApiOrigin();
let apiProvider=new TheFishingApi(configuredApi), lastFleetKey='';
function renderApiSettings() {
  $<HTMLInputElement>('#api-url').value=configuredApi;
  $('#api-state').textContent=configuredApi ? new URL(configuredApi).hostname : '연결 안 됨';
  $<HTMLDetailsElement>('#api-settings').open=!configuredApi;
}
renderApiSettings();
const form = $<HTMLFormElement>('#boat-form');
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const say = (value: string) => { $('#message').textContent = value; };
const savedMode=()=> $<HTMLSelectElement>('#query-mode').value==='saved';
const progress=new QueryProgress($('#query-monitor'));
const active = () => demo ? {...fixtureState(state.month),requiredPeople:state.requiredPeople,selectedSpecies:state.selectedSpecies,excludedSpeciesKeys:state.excludedSpeciesKeys,tideDays:state.tideDays,selectedRegion:state.selectedRegion} : savedMode() ? state : freshQueryView(livePreview || state,liveMonth,liveRows);
function connection() { $('#connectivity').textContent = navigator.onLine ? '● 온라인 · 월별 조회 준비' : '○ 오프라인 · 이전 조회 결과 열람'; }
function setBusy(value: boolean) { busy = value; root.setAttribute('aria-busy', String(value)); root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(n => { if (n.id !== 'cancel' && n.id!=='stop-query') n.disabled = value && !(livePreview && (n.closest('#calendar,#month-results') || n.matches('#view-calendar,#view-list'))); }); }
async function commit(candidate: AppState, message: string): Promise<boolean> {
  if (busy) return false; setBusy(true);
  try { await saveState(candidate); state = candidate; undoState = null; $('#undo').hidden = true; say(message); return true; }
  catch { say('기기에 저장하지 못했습니다. 저장 공간을 확인하거나 백업을 내려받으세요. 변경은 적용되지 않았습니다.'); return false; }
  finally { setBusy(false); render(); }
}
function chooseDay(day: string) { selectedDay = day; const shown=active(),result=queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly});renderCalendar($('#calendar'), shown, tier, search, day, chooseDay,matchingOnly,result); renderDay($('#day-view'), shown, day, tier, search,matchingOnly,result); }
function fleetVisible() {return orderedBoats(state).filter(b=>matchesPlatform(b,state.selectedPlatform) && matchesRegion(b,state.selectedRegion) && `${b.name} ${b.uid} ${b.port} ${regionLabel(b)} ${locationDescription(b)}`.toLowerCase().includes(fleetSearch.toLowerCase()));}
function renderFleet() {
  const target = $('#boats'),fragment=document.createDocumentFragment();
  const boats = fleetVisible();
  const selected=new Set(state.selectedUids),duplicates=possibleDuplicateIds(state.boats);
  const tiers=new Map(TIERS.flatMap(t=>state.tiers[t].map(id=>[id,t] as const)));
  $('#fleet-count').textContent = `${state.selectedUids.length}척 선택 / 전체 ${state.boats.length}척 · 표시 ${boats.length}척 · ${regionSummary(state.selectedRegion)}`;
  if (!boats.length) fragment.append(el('p', state.boats.length ? '검색 결과가 없습니다.' : '아직 등록한 선박이 없습니다. JSON을 가져오거나 선박을 추가하세요.', 'empty'));
  for (const boat of boats) {
    const row = el('article', '', 'boat-row'), info = el('div', '', 'boat-info'), label = el('label', '', 'boat-selection'), check = el('input');
    row.dataset.uid=boat.uid;
    check.type = 'checkbox'; check.checked = selected.has(boat.uid); check.setAttribute('aria-label', `${boat.name} 달력에 포함`);
    check.addEventListener('change', () => { const c = structuredClone(state); c.selectedUids = check.checked ? [...new Set([...c.selectedUids, boat.uid])] : c.selectedUids.filter(id => id !== boat.uid); void commit(c, '달력에 표시할 선박을 저장했습니다.'); });
    label.append(check, el('strong', boat.name),platformBadge(boat)); info.append(label, el('p', `${regionLabel(boat)} · ${boat.port || '정확한 항구 미확인'} · UID ${boat.uid}`, 'muted')); const link = sourceLink(boat.url, boat.uid); if (link) info.append(link);
    const location=locationDescription(boat);if(location) info.append(el('p',location,'location-evidence'));
    if(duplicates.has(boat.uid)) info.append(el('p','다른 플랫폼에 같은 이름·출항지 항목이 있습니다. 동일 선박 미확인 · 예약정보는 별도로 표시합니다.','muted'));
    const controls = el('div', '', 'boat-actions'), select = el('select'); select.setAttribute('aria-label', `${boat.name} 티어`);
    for (const t of TIERS) { const o = el('option', LABELS[t]); o.value = t; select.append(o); } select.value = tiers.get(boat.uid) || 'other';
    select.addEventListener('change', () => { const c = structuredClone(state); moveBoat(c, boat.uid, select.value as Tier); void commit(c, '티어를 저장했습니다.'); }); controls.append(select);
    for (const [caption, offset] of [['↑', -1], ['↓', 1]] as const) { const b = el('button', caption); b.type = 'button'; b.setAttribute('aria-label', `${boat.name} ${offset < 0 ? '위로' : '아래로'}`); b.addEventListener('click', () => { const c = structuredClone(state); moveBoat(c, boat.uid, tierFor(c, boat.uid), offset); void commit(c, '선박 순서를 저장했습니다.'); }); controls.append(b); }
    const edit = el('button', '수정'); edit.addEventListener('click', () => { editing = boat.uid; field('uid').value = boat.uid; field('uid').readOnly = true; field('name').value = boat.name; field('port').value = boat.port;field('sea').value=boat.region?.sea || '';field('province').value=boat.region?.province || '';field('local').value=boat.region?.local || ''; field('url').value = boat.url; field('tier').value = tierFor(state, boat.uid); form.hidden = false; field('name').focus(); });
    const remove = el('button', '삭제', 'quiet-danger'); remove.setAttribute('aria-label', `${boat.name} 삭제`); remove.addEventListener('click', async () => { const previous = structuredClone(state), c = structuredClone(state); removeBoat(c, boat.uid); if (await commit(c, '선박과 해당 기록을 삭제했습니다. 되돌릴 수 있습니다.')) { undoState = previous; $('#undo').hidden = false; } }); controls.append(edit, remove); row.append(info, controls); fragment.append(row);
  }
  target.replaceChildren(fragment);
}
function renderResults(shown:AppState,result=queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly})) {
  const fresh=(shown.monthChecks || []).filter(c=>c.month===shown.month && (c.source==='direct' || c.source==='api') && Date.now()-Date.parse(c.observedAt)<600000 && result.boats.some(b=>b.uid===c.uid)).length;
  $('#source-badge').textContent=demo ? '예시 자료' : savedMode() ? '이전 자료 · 예약 판단용 아님' : fresh ? `이번 조회 ${fresh}척` : '최신 조회 필요';
  $('#summary').textContent = `${LABELS[tier]} · ${shown.requiredPeople}명 · ${result.boats.length}척 대상 · ${result.days.length}일 / ${result.events.length}개 출조 일정`;
  const times=result.events.flatMap(e=>e.observedAt ? [e.observedAt]:[]).sort((a,b)=>Date.parse(b)-Date.parse(a));
  $('#last-observed').textContent=times[0] ? `이 달의 최근 관측 · ${new Date(times[0]).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`:'관측 시각 · 확인된 자료 없음';
  $('#calendar-layout').hidden=listView; $('#month-results').hidden=!listView;
  $('#view-calendar').setAttribute('aria-pressed',String(!listView)); $('#view-list').setAttribute('aria-pressed',String(listView));
  if(listView) renderMonthlyList($('#month-results'),shown,result,resultLimit,()=>{resultLimit+=50;render();},day=>{listView=false;selectedDay=day;render();});
  else {renderCalendar($('#calendar'),shown,tier,search,selectedDay,chooseDay,matchingOnly,result);renderDay($('#day-view'),shown,selectedDay,tier,search,matchingOnly,result);}
}
function render() {
  const shown = active(), result = queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly}), records=result.events;
  $<HTMLSelectElement>('#platform-filter').value=state.selectedPlatform || 'all';
  renderRegionFilter($('#region-filter'),state.boats.filter(b=>matchesPlatform(b,state.selectedPlatform)),state.selectedRegion,selectedRegion=>{resultLimit=50;void commit({...state,selectedRegion},`${regionSummary(selectedRegion)} 지역을 적용했습니다. 조회 버튼을 누르면 해당 지역 선박만 새로 조회합니다.`);});
  const catalog=(fleetSeed as {catalog?:{checkedAt:string;listed:number}}).catalog;
  $('#fleet-catalog-status').textContent=`더피싱 기본 목록 ${fleetSeed.state.boats.length}개${catalog ? ` · 확인 ${new Date(catalog.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`:''} · 매주 월요일 오전 6:17 갱신 예정. 선상24 ${sunsangSeed.boats.length}개는 PC 공개 목록(2026년 8~9월 자료)이며 자동 갱신하지 않습니다. 기존 선상24 링크 4개는 중복 추가하지 않습니다. 새 항목은 선택 해제 상태이며 개인 티어·선택은 유지됩니다.`;
  renderTideSummary($('#tide-status'),calculateTideMonth(shown.month,shown.tideDays || []));
  if (!selectedDay.startsWith(shown.month)) selectedDay = records[0]?.date || `${shown.month}-01`;
  $<HTMLInputElement>('#month').value = shown.month; $<HTMLInputElement>('#people').value=String(shown.requiredPeople); $('#month-label').textContent = `${shown.month.slice(0, 4)}년 ${Number(shown.month.slice(5))}월`;
  const panelOpen=$<HTMLDetailsElement>('#species-panel')?.open || false;
  renderSpeciesFilter($('#species-filter'),result.speciesCounts,state.selectedSpecies || 'all',state.excludedSpeciesKeys || [],(selectedSpecies,excludedSpeciesKeys)=>{
    resultLimit=50;void commit({...state,selectedSpecies,excludedSpeciesKeys},'어종 필터를 적용했습니다. 원본 조회 결과는 유지합니다.');
  },[...new Set(shown.events.map(eventSpecies))]);
  $<HTMLDetailsElement>('#species-panel').open=panelOpen;
  const selectedSpecies=normalizeSpeciesSelection(shown.selectedSpecies || 'all');
  $('#reservation-filter-summary').textContent=`${PLATFORM_LABELS[state.selectedPlatform || 'all']} · ${regionSummary(state.selectedRegion)} · ${LABELS[tier]} · ${selectedSpecies==='all' ? '전체 어종':selectedSpecies.length ? selectedSpecies.length<=2 ? selectedSpecies.map(speciesLabel).join(', '):`어종 ${selectedSpecies.length}개`:'어종 선택 없음'}${shown.excludedSpeciesKeys?.length ? ` · 제외 ${shown.excludedSpeciesKeys.length}개`:''}${search ? ' · 검색 적용':''}${matchingOnly ? '':' · 인원 미달 포함'}`;
  $('#query-status').replaceChildren();
  const fresh=(shown.monthChecks || []).filter(c=>c.month===shown.month && (c.source==='direct' || c.source==='api') && Date.now()-Date.parse(c.observedAt)<600000 && result.boats.some(b=>b.uid===c.uid)).length;
  const onlySunsang=state.selectedPlatform==='sunsang24' || (result.boats.length>0 && result.boats.every(b=>boatPlatform(b)==='sunsang24'));
  $('#query-status').append(el('strong',demo ? '예시 조회 결과' : savedMode() ? '이전 자료 열람 · 현재 잔여석이 아닙니다' : onlySunsang ? '선상24 공식 페이지 확인 필요':`이번 조회 ${fresh}척 · 미확인 ${result.missingBoats.length}척`),el('p',result.latest ? `자료 기준 ${new Date(result.latest).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 현재 잔여석은 공식 페이지에서 확인하세요.` : savedMode() ? '이 월의 저장 자료가 없습니다.' : onlySunsang ? '선상24는 선박 검색과 공식 페이지 연결을 제공합니다. 앱 내 실시간 조회는 아직 지원되지 않습니다.':'실시간 월 조회를 누르면 원본의 잔여석을 새로 확인합니다.'));
  if (result.missingBoats.length) { const missing=el('details'); missing.append(el('summary',`미확인 선박 ${result.missingBoats.length}척 보기`),el('p',result.missingBoats.map(b=>b.name).join(' · '))); $('#query-status').append(missing); }
  if (result.failures.length) $('#query-status').append(el('p',`${result.failures.length}척에 수집 실패 이력이 있습니다. 현재 예약 가능 여부는 확인되지 않았습니다.`,'notice'));
  if(onlySunsang || result.boats.some(b=>boatPlatform(b)==='sunsang24')) $('#query-status').append(el('p',SUNSANG24_DISABLED_MESSAGE,'notice'));
  $('#archive-months').replaceChildren();
  for (const month of [...new Set([...state.events.map(e=>e.date.slice(0,7)),...(state.monthChecks || []).map(c=>c.month)])].sort()) {
    const b=el('button',`${month.slice(0,4)}년 ${Number(month.slice(5))}월 자료`); b.setAttribute('aria-pressed',String(month===state.month)); b.addEventListener('click',()=>{$<HTMLSelectElement>('#query-mode').value='saved';$('#query-mode').dispatchEvent(new Event('change'));void setMonth(month);}); $('#archive-months').append(b);
  }
  $('#live-diagnostics').hidden=!liveRows.length;
  renderDiagnostics($('#live-rows'),liveRows);
  $('#demo-banner').hidden = !demo; $('#demo').textContent = demo ? '실제 조회 자료로 돌아가기' : '예시 둘러보기'; $('#fleet-section').hidden = demo;
  $('#tabs').replaceChildren(); for (const t of ['all', ...TIERS] as Filter[]) { const b = el('button', LABELS[t]); b.setAttribute('aria-pressed', String(t === tier)); b.addEventListener('click', () => { tier = t; render(); }); $('#tabs').append(b); }
  $('#source-access').hidden = demo;
  renderSourceAccess($('#source-access'), state, sourceBoat, value => { sourceBoat=value; render(); });
  renderResults(shown,result);
  // Saves clone state. Compare fleet values so a month/tide change doesn't rebuild every row.
  const fleetKey=JSON.stringify([state.boats,state.tiers,state.selectedUids,state.selectedRegion,state.selectedPlatform]);
  if(lastFleetKey!==fleetKey) {renderFleet();lastFleetKey=fleetKey;}
  connection();if(busy) setBusy(true);
}
$<HTMLInputElement>('#import').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement, files = [...(input.files || [])]; if (!files.length || busy) return;
  importController = new AbortController(); const { signal } = importController; setBusy(true); $('#cancel').hidden = false; say('자료를 확인하고 있습니다…');
  try {
    let c = structuredClone(state); const warnings: string[] = [];
    for (const file of files) { if (file.size > 20_000_000) throw new Error('20MB 이하 JSON을 선택하세요.'); const data = JSON.parse(await file.text()); signal.throwIfAborted(); if(isTierBackup(data)) c=restoreTierBackup(data,c).state; else {const r = importData(data, c); c = r.state; warnings.push(...r.warnings);} }
    signal.throwIfAborted(); await saveState(c, signal); state = c; demo = false; selectedDay = state.events.find(e => e.date.startsWith(state.month))?.date || `${state.month}-01`; undoState = null; $('#undo').hidden = true;
    say(`가져오기 완료 · ${files.length}개 파일. ${warnings.slice(0, 4).join(' ')}`);
  } catch (error) { say(signal.aborted ? '가져오기를 취소했습니다. 기존 자료를 유지합니다.' : `가져오지 못했습니다. ${error instanceof Error ? error.message : 'JSON 형식을 확인하세요.'}`); }
  finally { input.value = ''; importController = null; $('#cancel').hidden = true; setBusy(false); render(); }
});
$('#query-form').addEventListener('submit',async event=>{
  event.preventDefault(); if (busy) return;
  const month=$<HTMLInputElement>('#month').value, requiredPeople=Number($<HTMLInputElement>('#people').value);
  try { queryMonth(state,{month,requiredPeople,tier,search,matchingOnly}); } catch (error) { say(error instanceof Error ? error.message : '조회 조건을 확인하세요.'); return; }
  const candidate={...state,month,requiredPeople}; resultLimit=50; selectedDay=`${month}-01`;
  if(demo || $<HTMLSelectElement>('#query-mode').value==='saved') {await commit(candidate,'저장된 월별 자료를 조건 검색했습니다.');return;}
  const boats=orderedBoats(candidate).filter(b=>candidate.selectedUids.includes(b.uid) && matchesPlatform(b,candidate.selectedPlatform) && matchesRegion(b,candidate.selectedRegion) && (tier==='all' || tierFor(candidate,b.uid)===tier));
  if(!boats.length) {say('선택한 지역·티어에 조회할 선박이 없습니다. 내 선박 관리에서 선박을 선택하거나 지역을 변경하세요.');return;}
  liveRows=[];liveMonth=month;progress.reset();render();
  if(!navigator.onLine) {say('오프라인입니다. 현재 잔여석을 확인할 수 없습니다. 연결 후 다시 조회하세요.');return;}
  const useApi=$<HTMLSelectElement>('#query-mode').value==='api';
  if(useApi && !configuredApi) {say('조회 API를 먼저 연결하세요. API 주소를 입력하고 연결 확인 및 저장을 누르세요.');$<HTMLDetailsElement>('#api-settings').open=true;$<HTMLInputElement>('#api-url').focus();return;}
  const provider=new IntegratedProvider(useApi ? apiProvider:directProvider,new Sunsang24Api(configuredApi));
  const started=performance.now();
  liveController=new AbortController();livePreview=candidate;render();setBusy(true); $('#stop-query').hidden=false;progress.start(boats.length);
  $('#live-diagnostics').hidden=true;$('#diagnostic-text').hidden=true;
  $('#live-progress').textContent=`${boats.length}척 조회 시작 · 완료된 선박부터 달력에 표시합니다.`;
  const applied=new Set<string>();let previewTimer:ReturnType<typeof setTimeout>|undefined,lastPaint=-Infinity;
  const paint=()=>{previewTimer=undefined;if(livePreview) {renderResults(active());lastPaint=performance.now();}};
  try {
    const result=await collectMonth(provider,boats,month,liveController.signal,(rows,total)=>{
      liveRows=rows;progress.update(rows.length,rows.filter(row=>row.result.status==='ALLOWED_READABLE').length);const delta=rows.filter(row=>!applied.has(row.boat.uid)),last=delta.at(-1)!;
      for(const row of delta) applied.add(row.boat.uid);
      livePreview=applyLiveResults(livePreview || candidate,month,delta);
      $('#live-progress').textContent=`${rows.length}/${total}척 확인 · ${last.boat.name} · 달력에 순차 반영 중`;
      if(performance.now()-lastPaint>=250) {if(previewTimer) clearTimeout(previewTimer);paint();}
      else if(!previewTimer) previewTimer=setTimeout(paint,250-(performance.now()-lastPaint));
    },useApi ? 3:1);
    if(previewTimer) clearTimeout(previewTimer);
    const updated=applyLiveResults(candidate,month,result.rows); await saveState(updated);state=updated;undoState=null;$('#undo').hidden=true;
    const ok=result.rows.filter(r=>r.result.status==='ALLOWED_READABLE').length, failed=result.rows.length-ok, unattempted=result.total-result.rows.length;
    const outcome=result.cancelled ? '조회 취소' : result.stopped ? '조회 중단' : '조회 완료';progress.finish(outcome);
    const status=`${outcome} · 성공 ${ok}척 · 실패/미지원 ${failed}척 · 미조회 ${unattempted}척 · ${((performance.now()-started)/1000).toFixed(1)}초`;
    $('#live-progress').textContent=status; say(status+' · 이번에 확인한 잔여석만 표시합니다.');
  } catch(error) {liveRows=[];progress.finish('조회 실패');$('#live-progress').textContent='최신 잔여석을 반영하지 못했습니다. 다시 조회하세요.';say(`조회 결과를 반영하지 못했습니다. ${error instanceof Error ? error.message : '다시 조회하세요.'}`);}
  finally {if(previewTimer) clearTimeout(previewTimer);livePreview=null;liveController=null;$('#stop-query').hidden=true;setBusy(false);render();if(liveRows.some(row=>row.result.status!=='ALLOWED_READABLE')) $<HTMLDetailsElement>('#live-diagnostics').open=true;}
});
$('#copy-diagnostics').addEventListener('click',async()=>{
  const report=diagnosticReport(liveRows,liveMonth), fallback=$<HTMLTextAreaElement>('#diagnostic-text');
  try {await navigator.clipboard.writeText(report);say('조회 진단을 복사했습니다. 오류 확인에 이 내용을 사용할 수 있습니다.');}
  catch {fallback.value=report;fallback.hidden=false;fallback.focus();fallback.select();say('아래 진단 내용을 길게 눌러 복사하세요.');}
});
$('#stop-query').addEventListener('click',()=>{liveController?.abort();});
$('#query-mode').addEventListener('change',()=>{$('#query-submit').textContent=$<HTMLSelectElement>('#query-mode').value==='saved' ? '저장 자료 검색':'실시간 월 조회';render();});
$('#api-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy) return;setBusy(true);
  try {const origin=await checkApi($<HTMLInputElement>('#api-url').value);saveApiOrigin(origin);configuredApi=origin;apiProvider=new TheFishingApi(origin);renderApiSettings();say('조회 API 연결을 확인했습니다. 월과 인원을 선택하고 실시간 월 조회를 누르세요.');}
  catch(error) {say(`API를 연결하지 못했습니다. ${error instanceof Error ? error.message:''}`);}
  finally {setBusy(false);}
});
$('#api-clear').addEventListener('click',()=>{if(busy) return;try {clearApiOrigin();configuredApi='';renderApiSettings();say('이 기기의 API 연결을 해제했습니다.');} catch {say('기기 설정을 변경하지 못했습니다.');}});
$('#matching-only').addEventListener('change',event=>{matchingOnly=(event.currentTarget as HTMLInputElement).checked; resultLimit=50; render();});
$('#view-calendar').addEventListener('click',()=>{listView=false;render();});
$('#view-list').addEventListener('click',()=>{listView=true;render();});
$('#cancel').addEventListener('click', () => importController?.abort());
let savingFile=false;
async function exportFile(tiersOnly:boolean,share=false) {
  if(busy || savingFile) return;savingFile=true;
  try {
    const outcome=await saveJsonFile(tiersOnly ? exportTierBackup(state):exportData(state),tiersOnly ? 'thefishing-tiers':'thefishing-full-backup',share);
    say(outcome==='cancelled' ? '파일 공유를 취소했습니다. 기기 설정은 유지됩니다.' : outcome==='shared' ? '파일을 공유 화면으로 전달했습니다. 선택한 저장 위치에서 파일을 확인하세요.' : 'JSON 파일 다운로드를 요청했습니다. 휴대폰의 다운로드·파일 앱에서 확인하세요.');
  } catch {say('파일을 저장하지 못했습니다. 티어 목록 저장 버튼으로 다시 다운로드하거나 브라우저의 다운로드 설정을 확인하세요.');}
  finally {savingFile=false;}
}
$('#export').addEventListener('click',()=>void exportFile(false));
$('#tier-export').addEventListener('click',()=>void exportFile(true));
$('#tier-share').hidden=!canShareJson();
$('#tier-share').addEventListener('click',()=>void exportFile(true,true));
$<HTMLInputElement>('#tier-import').addEventListener('change',async event=>{
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file || busy) return;
  const previous=structuredClone(state);setBusy(true);
  try {
    if(file.size>20_000_000) throw new Error('20MB 이하 JSON을 선택하세요.');
    const restored=restoreTierBackup(JSON.parse(await file.text()),state);
    await saveState(restored.state);state=restored.state;undoState=previous;$('#undo').hidden=false;
    say(`티어 ${restored.count}척 복원 완료 · 파일의 티어·순서·선택 상태를 적용했습니다. 다른 선박과 조회 자료는 유지합니다. 변경 되돌리기가 가능합니다.`);
  } catch(error) {say(`티어를 복원하지 못했습니다. 기존 설정을 유지합니다. ${error instanceof Error ? error.message:''}`);}
  finally {input.value='';setBusy(false);render();}
});
$('#restore-sunsang-tiers').addEventListener('click',async()=>{
  const previous=structuredClone(state);
  if(await commit(applySunsangTiers(state,true),`선상24 PC 목록 ${SUNSANG_TIER_COUNT}척의 티어·순서·선택 상태를 다시 적용했습니다. 다른 선박 설정은 유지합니다.`)) {undoState=previous;$('#undo').hidden=false;}
});
$('#demo').addEventListener('click', () => { demo = !demo; selectedDay = `${state.month}-${demo ? '09' : '01'}`; render(); });
async function setMonth(value: string) { if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(value)) return; if(busy) return;const c = structuredClone(state); c.month = value; resultLimit=50;if(value!==state.month) {liveRows=[];progress.reset();}await commit(c, '조회 월을 변경했습니다. 실시간 월 조회를 눌러 새 잔여석을 확인하세요.'); }
$<HTMLInputElement>('#month').addEventListener('change', e => { void setMonth((e.currentTarget as HTMLInputElement).value); });
for (const [id, offset] of [['prev', -1], ['next', 1]] as const) $('#' + id).addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); void setMonth(new Date(Date.UTC(y, m - 1 + offset)).toISOString().slice(0, 7)); });
$<HTMLInputElement>('#search').addEventListener('input', e => { search = (e.currentTarget as HTMLInputElement).value.trim(); render(); });
$<HTMLSelectElement>('#platform-filter').addEventListener('change',event=>{const selectedPlatform=readPlatform((event.currentTarget as HTMLSelectElement).value);resultLimit=50;void commit({...state,selectedPlatform},`${PLATFORM_LABELS[selectedPlatform]} 플랫폼을 적용했습니다. 내 선박 관리에서 조회할 선박을 선택하세요.`);});
$<HTMLInputElement>('#fleet-search').addEventListener('input', e => { fleetSearch = (e.currentTarget as HTMLInputElement).value.trim(); renderFleet(); });
function closeForm() { form.hidden = true; editing = null; form.reset(); field('uid').readOnly = false; }
$('#add-toggle').addEventListener('click', () => { closeForm(); form.hidden = false; field('uid').focus(); }); $('#edit-cancel').addEventListener('click', closeForm);
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const id = field('uid').value.trim(), name = text(field('name').value, 100), port = text(field('port').value, 100), raw = field('url').value.trim(), url = reservationLink(raw, id);
  if ((!editing && !/^\d{1,20}$/.test(id)) || !name || (raw && !url)) { say('숫자 UID, 선박 이름, 저장된 선박과 일치하는 공식 HTTPS URL을 확인하세요.'); return; }
  const c = structuredClone(state), index = c.boats.findIndex(b => b.uid === id);
  if (index >= 0 && !editing) { say('이미 등록한 UID입니다. 목록의 수정 버튼을 이용하세요.'); return; }
  if (index >= 0) c.boats[index] = { uid: id, name, port, url,region:readRegion({sea:field('sea').value,province:field('province').value,local:field('local').value}) }; else { c.boats.push({ uid: id, name, port, url,region:readRegion({sea:field('sea').value,province:field('province').value,local:field('local').value}) }); c.selectedUids.push(id); }
  if (index < 0 || tierFor(c, id) !== field('tier').value) moveBoat(c, id, field('tier').value as Tier);
  if (await commit(c, '선박 정보를 저장했습니다.')) closeForm();
});
for (const [id, include] of [['select-all', true], ['select-none', false]] as const) $('#' + id).addEventListener('click', () => { const c = structuredClone(state); const ids=new Set(fleetVisible().map(b=>b.uid));c.selectedUids = include ? [...new Set([...c.selectedUids,...ids])]:c.selectedUids.filter(uid=>!ids.has(uid)); void commit(c, '달력 선박 선택을 저장했습니다.'); });
$('#undo').addEventListener('click', async () => { if (undoState) await commit(undoState, '이전 상태로 되돌렸습니다.'); });
$('#restore-fleet').addEventListener('click', async () => { const previous=structuredClone(state); if (await commit(applyDefaultFleet(state), '기본 선박 목록과 초기 선택·티어를 복원했습니다. 기존 출조 기록은 유지합니다.')) { undoState=previous; $('#undo').hidden=false; } });
$('#tide-refresh').addEventListener('click',async()=>{
  if(busy) return;if(!configuredApi) {say('물때를 갱신하려면 조회 API를 먼저 연결하세요.');return;}
  if(!navigator.onLine) {say('오프라인입니다. 저장된 물때를 표시합니다.');return;}
  const month=state.month;setBusy(true);say(`${month} 보령 물때를 불러오는 중입니다.`);
  try {
    const result=await readTideMonth(configuredApi,month,new AbortController().signal);
    const candidate={...state,tideDays:mergeTideDays(state.tideDays,result.days)};await saveState(candidate);state=candidate;undoState=null;$('#undo').hidden=true;say(result.message);
  } catch {say('물때를 갱신하지 못했습니다. 기존 물때·예약 조회 자료는 유지합니다.');}
  finally {setBusy(false);render();}
});
window.addEventListener('online', connection); window.addEventListener('offline', connection);
setBusy(true); try { const prepared=initializeFleet(await loadState()), archive=initializeMonthlyArchive(prepared.state); state=archive.state;const tideDays=mergeTideDays(tideArchive.days,state.tideDays),tidesChanged=JSON.stringify(tideDays)!==JSON.stringify(state.tideDays);state={...state,tideDays}; if (prepared.changed || archive.changed || tidesChanged) await saveState(state); if (prepared.seeded) say(`기본 선박 목록 적용 완료 · 전체 ${state.boats.length}척 · 선택 ${state.selectedUids.length}척. 티어와 순서를 유지했습니다.`); } catch { say('저장 자료를 읽거나 저장하지 못했습니다. 기본 목록·티어 복원 또는 백업 JSON 가져오기를 이용하세요.'); } finally { setBusy(false); render(); }
// Refresh freshness labels while visible; this never makes a network request.
setInterval(()=>{if(!busy && document.visibilityState==='visible') render();},60000);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { say('오프라인 화면 저장에 실패했습니다. 연결된 상태에서 다시 열어 주세요.'); });
