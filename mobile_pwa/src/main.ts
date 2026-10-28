import {retainFocus,retainDisclosureUi,canFocus} from './uiFocus';
import {LiveStatus} from './liveStatus';
import {renderQueryFeedback,requestCounts,installQueryRecovery,revealSelectedDay,beginQuerySession,queryScopeChanged,queryScopeFingerprint,type QuerySession} from './queryFeedback';
import {renderCatalogCoverage} from './catalogCoverage';
import {appLayout} from './appLayout';
import {alphabeticFleet,uniqueFleet,platformCounts,supportsLive,platformQueryStats} from './fleetList';
import {watchAppUpdates} from './appUpdate';
import {initializePreferenceRecovery,RECOVERY_VERSION} from './preferenceRecovery';
import {installPreferenceRecovery} from './preferenceRecoveryView';
import { emptyState, localMonth, LABELS, TIERS, reservationLink, text, type AppState, type Filter, type Tier, type Boat } from './models';
import { importData, exportData } from './importLegacy';
import {exportTierBackup,restoreTierBackup,isTierBackup} from './tierBackup';
import {saveJsonFile,canShareJson} from './fileSave';
import {applySunsangTiers,SUNSANG_TIER_COUNT} from './sunsang24Tiers';
import { loadState, saveState,backupPreferences,previousPreferences,StorageConflictError } from './availabilityStore';
import {applyPublishedPreferences,PUBLISHED_PREFERENCES_VERSION,PUBLISHED_PREFERENCES_COUNTS} from './publishedPreferences';
import {bookingAlias} from './bookingAliases';
import { orderedBoats, moveBoat, removeBoat, tierFor, matchesTier, readTierFilter, tierFilterLabel, toggleTierFilter } from './tierStore';
import {tierQueryState,tierQueryBoats} from './tierQuery';
import {tierVisibility} from './tierVisibility';
import {speciesOptions} from './species';
import {installFilterPanels,finishFilterPanels,type QueryOutcome} from './filterPanels';
import { renderCalendar } from './calendarView';
import { el, renderDay, sourceLink } from './dayView';
import { fixtureState } from './providers/fixtures';
import { TheFishingDirect } from './providers/thefishingDirect';
import { TheFishingApi, loadApiOrigin, saveApiOrigin, clearApiOrigin, checkApi } from './providers/thefishingApi';
import { collectMonth, applyLiveResults, createLivePreview, type LiveRow } from './liveQuery';
import { initializeFleet, applyDefaultFleet } from './defaultFleet';
import { renderSourceAccess } from './sourceAccess';
import { initializeMonthlyArchive } from './monthlyArchive';
import { queryMonth } from './monthlyQuery';
import { renderMonthlyList } from './monthlyView';
import { diagnosticReport, renderDiagnostics } from './queryDiagnostics';
import { renderSpeciesFilter } from './speciesFilter';

import tideArchive from './data/tideArchive.json';
import { calculateTideMonth,mergeTideDays } from './tides';
import { renderTideSummary } from './tideView';
import { readTideMonth } from './providers/tideApi';
import { freshQueryView } from './freshResults';
import { QueryProgress } from './queryProgress';
import { matchesRegion,readRegion,regionLabel,regionSummary,emptyRegion } from './regions';
import { renderRegionFilter } from './regionFilter';
import fleetSeed from './data/defaultFleet.json';
import {boatPlatform,matchesPlatform,platformBadge,readPlatform,PLATFORM_LABELS,possibleDuplicateIds} from './platforms';
import {publicRouteForBoat} from './sunsang24PublicRoutes';
import {locationDescription} from './regions';
import {IntegratedProvider} from './providers/sunsang24Api';
import {Sunsang24PublicApi} from './providers/sunsang24PublicApi';
const root = document.querySelector<HTMLDivElement>('#app')!;
// Only static markup is inserted here. All imported content uses textContent/value.
root.innerHTML = appLayout(SUNSANG_TIER_COUNT);
// Keep the live channel outside aria-busy so progress is not deferred until completion.
const statusNode=root.querySelector<HTMLElement>('#app-announcement')!;root.before(statusNode);
const liveStatus=new LiveStatus(statusNode);
installFilterPanels(root);
installQueryRecovery(root);
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let state = emptyState(), tier: Filter = 'all', fleetSearch = '', demo = false;
let selectedDay = `${state.month}-01`, busy = false, storageReady=false, editing: string | null = null;
let restoreBusyFocus:()=>void=()=>{};
let sourceBoat = '', matchingOnly=true, listView=false, resultLimit=50;
let importController: AbortController | null = null, undoState: AppState | null = null;
let liveController:AbortController|null=null; const directProvider=new TheFishingDirect();
let liveRows:LiveRow[]=[], liveMonth=state.month;
let querySession:QuerySession|null=null;
let queryBoats:Boat[]=[],fleetSort='name';
const fleetRows=new Map<string,{signature:string;row:HTMLElement;select:HTMLSelectElement}>();
let livePreview:AppState|null=null;
let refreshRecovery:()=>void=()=>{};
let configuredApi=loadApiOrigin();
let apiProvider=new TheFishingApi(configuredApi), lastFleetKey='', lastRegionKey='';
function renderApiSettings() {
  $<HTMLInputElement>('#api-url').value=configuredApi;
  $('#api-state').textContent=configuredApi ? new URL(configuredApi).hostname : '연결 안 됨';
  $<HTMLDetailsElement>('#api-settings').open=!configuredApi;
}
renderApiSettings();
const form = $<HTMLFormElement>('#boat-form');
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const say = (value: string) => { $('#message').textContent = value;liveStatus.say(value); };
let search=''; // Result-only text filter; never part of source request membership.
const savedMode=()=> $<HTMLSelectElement>('#query-mode').value==='saved';
const progress=new QueryProgress($('#query-monitor'));
const active = () => tierQueryState(demo ? {...fixtureState(state.month),requiredPeople:state.requiredPeople,selectedSpecies:state.selectedSpecies,excludedSpeciesKeys:state.excludedSpeciesKeys,tideDays:state.tideDays,selectedRegion:state.selectedRegion} : savedMode() ? state : freshQueryView(livePreview || state,liveMonth,liveRows));
function connection() { $('#connectivity').textContent = navigator.onLine ? '● 온라인 · 월별 조회 준비' : '○ 오프라인 · 이전 조회 결과 열람'; }
function setBusy(value: boolean) {
  if(value && !busy) restoreBusyFocus=retainFocus(root);
  busy=value;root.setAttribute('aria-busy',String(value));
  root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(n=>{if(n.id!=='cancel' && n.id!=='stop-query') n.disabled=n.dataset.locked==='true' || value && !(livePreview && (n.closest('#calendar,#month-results') || n.matches('#view-calendar,#view-list')));});
  if(!value) {restoreBusyFocus();restoreBusyFocus=()=>{};}
}
async function commit(candidate: AppState, message: string): Promise<boolean> {
  if (busy || !storageReady) return false; const restoreFocus=retainFocus(root,()=>$('#fleet-search'));setBusy(true);
  const needsQuery=!demo && !savedMode() && queryScopeChanged(candidate,readTierFilter(candidate.selectedTiers),querySession) && queryScopeFingerprint(state)!==queryScopeFingerprint(candidate);
  try { await saveState(candidate); state = candidate; undoState = null; $('#undo').hidden = true; say(message+(needsQuery?' 현재 조건으로 새 조회가 필요합니다.':'')); return true; }
  catch(error) { say(error instanceof StorageConflictError?error.message:'기기에 저장하지 못했습니다. 저장 공간을 확인하거나 백업을 내려받으세요. 변경은 적용되지 않았습니다.'); return false; }
  finally { setBusy(false); render();restoreFocus(); }
}
function chooseDay(day: string,keyboard=false) { selectedDay = day; const shown=active(),result=queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly});renderCalendar($('#calendar'), shown, tier, search, day, chooseDay,matchingOnly,result); renderDay($('#day-view'), shown, day, tier, search,matchingOnly,result);revealSelectedDay(root,keyboard); }
function fleetVisible() {return (fleetSort==='name'?alphabeticFleet(state.boats):uniqueFleet(orderedBoats(state))).filter(b=>matchesPlatform(b,state.selectedPlatform) && matchesRegion(b,state.selectedRegion) && `${b.name} ${b.uid} ${b.port} ${regionLabel(b)} ${locationDescription(b)}`.toLowerCase().includes(fleetSearch.toLowerCase()));}
function renderFleet() {
  const target = $('#boats'),restoreFocus=retainDisclosureUi(target,()=>$('#fleet-search')),fragment=document.createDocumentFragment();
  const boats = fleetVisible();
  const duplicates=possibleDuplicateIds(state.boats);
  const tiers=new Map(TIERS.flatMap(t=>state.tiers[t].map(id=>[id,t] as const)));
  const total=uniqueFleet(state.boats),counts=platformCounts(boats),external=counts.all-counts.thefishing-counts.sunsang24;
  $('#fleet-count').textContent = `전체 ${total.length}개 등록 항목 · 표시 ${boats.length}개 (더피싱 ${counts.thefishing} · 선상24 ${counts.sunsang24}${external?' · 외부 '+external:''}) · 일정 연동 ${boats.filter(supportsLive).length}개 · 티어 등록 ${total.filter(b=>tiers.has(b.uid)).length}개 · ${regionSummary(state.selectedRegion)}`;
  renderCatalogCoverage($('#catalog-coverage'),state.boats,state.selectedRegion);
  $('#fleet-brief').textContent=`${tiers.size}척 등록`;
  target.dataset.sort=fleetSort;
  const alive=new Set(state.boats.map(b=>b.uid));for(const id of fleetRows.keys()) if(!alive.has(id)) fleetRows.delete(id);
  if (!boats.length) fragment.append(el('p', state.boats.length ? '검색 결과가 없습니다.' : '아직 등록한 선박이 없습니다. JSON을 가져오거나 선박을 추가하세요.', 'empty'));
  for (const boat of boats) {
    const signature=JSON.stringify([boat,duplicates.has(boat.uid)]),cached=fleetRows.get(boat.uid);
    if(cached?.signature===signature) {cached.select.value=tiers.get(boat.uid) || '';cached.row.classList.toggle('is-registered',tiers.has(boat.uid));fragment.append(cached.row);continue;}
    const row = el('article', '', 'boat-row'), info = el('div', '', 'boat-info'), label = el('div', '', 'boat-title');
    row.dataset.uid=boat.uid;
    row.classList.toggle('is-registered',tiers.has(boat.uid));
    label.append(el('strong', boat.name),platformBadge(boat));info.append(label);
    const metadata=el('p','','boat-meta'),region=el('span',`${regionLabel(boat)} · ${boat.port || '출항지 미확인'}`);region.title=locationDescription(boat) || region.textContent || '';
    const capability=el('span',supportsLive(boat)?'일정 연동':'공식 페이지 확인',supportsLive(boat)?'live-capable':'link-only');metadata.append(region,capability);info.append(metadata);
    const details=el('details','','boat-more'),summary=el('summary','···');summary.setAttribute('aria-label',`${boat.name} 관리 메뉴`);details.dataset.focusKey=`boat-menu:${boat.uid}`;details.append(summary);
    const extra=el('div','','boat-extra');extra.append(el('p',`UID ${boat.uid}`,'muted'));
    const alias=bookingAlias(boat.uid),link=sourceLink(alias?.url || boat.url,boat.uid,boat.name);if(link) {if(alias) link.textContent='연동 예약 페이지 ↗';extra.append(link);}
    const location=locationDescription(boat);if(location) extra.append(el('p',location,'location-evidence'));
    if(duplicates.has(boat.uid)) extra.append(el('p','다른 플랫폼에 같은 이름·출항지 항목이 있습니다. 예약정보는 플랫폼별로 구분합니다.','muted'));
    const controls = el('div', '', 'boat-actions'), select = el('select'); select.setAttribute('aria-label', `${boat.name} 티어`);
    const unregistered=el('option','티어 미등록');unregistered.value='';unregistered.disabled=true;select.append(unregistered);
    for (const t of TIERS) { const o = el('option', LABELS[t]); o.value = t; select.append(o); } select.value = tiers.get(boat.uid) || '';
    select.addEventListener('change', () => { const c = structuredClone(state); moveBoat(c, boat.uid, select.value as Tier); void commit(c, '티어를 저장했습니다.'); }); controls.append(select);
    const reorder=el('div','','reorder-actions');
    for (const [caption, offset] of [['↑', -1], ['↓', 1]] as const) { const b = el('button', caption); b.type = 'button'; b.setAttribute('aria-label', `${boat.name} ${offset < 0 ? '위로' : '아래로'}`); b.addEventListener('click', () => { const c = structuredClone(state); moveBoat(c, boat.uid, tierFor(c, boat.uid), offset); void commit(c, '선박 순서를 저장했습니다.'); }); reorder.append(b); }extra.append(reorder);
    const edit = el('button', '수정');edit.dataset.focusKey=`boat-edit:${boat.uid}`;edit.setAttribute('aria-label',`${boat.name} 수정`); edit.addEventListener('click', () => { editing = boat.uid;formReturnKey=edit.dataset.focusKey || ''; field('uid').value = boat.uid; field('uid').readOnly = true; field('name').value = boat.name; field('port').value = boat.port;field('sea').value=boat.region?.sea || '';field('province').value=boat.region?.province || '';field('local').value=boat.region?.local || ''; field('url').value = boat.url; field('tier').value = tierFor(state, boat.uid); form.hidden = false; $<HTMLDetailsElement>('.fleet-management').open=true; field('name').focus(); });
    const remove = el('button', '삭제', 'quiet-danger'); remove.setAttribute('aria-label', `${boat.name} 삭제`); remove.addEventListener('click', async () => { const previous = structuredClone(state), c = structuredClone(state); removeBoat(c, boat.uid); if (await commit(c, '선박과 해당 기록을 삭제했습니다. 되돌릴 수 있습니다.')) { undoState = previous; $('#undo').hidden = false; } });extra.append(edit,remove);details.append(extra);controls.append(details);row.append(info,controls);fragment.append(row);fleetRows.set(boat.uid,{signature,row,select});
  }
  target.replaceChildren(fragment);restoreFocus();
}
function renderPlatformResults() {
  const target=$('#platform-results');target.replaceChildren();
  target.hidden=!queryBoats.length || liveMonth!==state.month;
  if(target.hidden) return;
  for(const item of platformQueryStats(queryBoats,liveRows)) {
    const card=el('div','','platform-result');card.dataset.platform=item.platform;
    card.append(el('strong',PLATFORM_LABELS[item.platform]),el('span',`${item.success}/${item.total}척 확인 · 일정 ${item.events}건`));
    const states=[item.empty?`확인된 일정 없음 ${item.empty}`:'',item.unlinked?`공개 주소 미연동 ${item.unlinked}`:'',item.restricted?`접근 제한 ${item.restricted}`:'',item.failed?`조회 실패 ${item.failed}`:'',item.pending?`${liveController?'대기':'미조회'} ${item.pending}`:''].filter(Boolean);
    card.append(el('small',states.join(' · ') || '조회 완료'));target.append(card);
  }
}
function renderResults(shown:AppState,result=queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly})) {
  const monitor=$('#query-monitor');
  monitor.hidden=demo || savedMode() || !monitor.dataset.scope || monitor.dataset.scope!==queryScopeFingerprint(shown,tier) || !!querySession?.issue && ['scope','invalid','offline','api'].includes(querySession.issue);
  const fresh=(shown.monthChecks || []).filter(c=>c.month===shown.month && (c.source==='direct' || c.source==='api') && Date.now()-Date.parse(c.observedAt)<600000 && result.boats.some(b=>b.uid===c.uid)).length;
  $('#source-badge').textContent=demo ? '예시 자료' : savedMode() ? '이전 자료 · 예약 판단용 아님' : queryScopeChanged(shown,tier,querySession)?'조건 변경 · 재조회 필요':fresh ? `이번 조회 ${fresh}척` : '최신 조회 필요';
  $('#summary').textContent = `${result.days.length}일 / ${result.events.length}개 출조 일정 · 현재 어종·인원${search.trim()?'·결과 검색':''} 조건 적용`;
  renderQueryFeedback(root,shown,result,tier,querySession,queryBoats,liveRows,demo?'demo':savedMode()?'saved':'live',search);
  $('#calendar-layout').hidden=listView; $('#month-results').hidden=!listView;
  $('#view-calendar').setAttribute('aria-pressed',String(!listView)); $('#view-list').setAttribute('aria-pressed',String(listView));
  if(listView) renderMonthlyList($('#month-results'),shown,result,resultLimit,()=>{resultLimit+=50;render();},(day,keyboard)=>{listView=false;selectedDay=day;render();revealSelectedDay(root,!!keyboard);});
  else {renderCalendar($('#calendar'),shown,tier,search,selectedDay,chooseDay,matchingOnly,result);renderDay($('#day-view'),shown,selectedDay,tier,search,matchingOnly,result);}
}
function render() {
  const restoreFocus=retainFocus(root);
  refreshRecovery();
  tier=readTierFilter(state.selectedTiers);
  const shown = active(), result = queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search,matchingOnly}), records=result.events;
  const counts=platformCounts(state.boats.filter(b=>matchesRegion(b,state.selectedRegion))),allCounts=platformCounts(state.boats);
  for(const button of $('#platform-filter').querySelectorAll<HTMLButtonElement>('button')) {const platform=readPlatform(button.dataset.platform);button.textContent=`${PLATFORM_LABELS[platform]} ${counts[platform]}`;button.title=`선택 지역 ${counts[platform]}개 · 전국 보유 목록 ${allCounts[platform]}개`;button.setAttribute('aria-pressed',String(platform===(state.selectedPlatform || 'all')));}
  // Keep region controls and keyboard focus when only dates, tides or results change.
  // Storage saves clone the state, so compare values instead of object identity.
  const regionKey=JSON.stringify([state.boats,state.selectedRegion]);
  if(lastRegionKey!==regionKey) {
    renderRegionFilter($('#region-filter'),state.boats,state.selectedRegion,selectedRegion=>{resultLimit=50;void commit({...state,selectedRegion},`${regionSummary(selectedRegion)} 지역을 적용했습니다. 조회 버튼을 누르면 해당 지역 선박만 새로 조회합니다.`);});
    lastRegionKey=regionKey;
  }
  const targets=tierQueryBoats(state,tier),targetCounts=platformCounts(targets);
  $('#query-target').textContent=`등록 티어 중 ${targets.length}척 조회 대상`;
  const visibility=tierVisibility(tierQueryState(state),tier);
  $('#tier-saved-counts').textContent=`내 선박 · 저장 티어 ${visibility.total}척 · ${TIERS.map(t=>`${LABELS[t]} ${visibility.counts[t]}`).join(' / ')}`;
  const hiddenReasons=[visibility.unselected?`선박 선택 해제 ${visibility.unselected}척`:'',visibility.excludedTier?`티어 필터 제외 ${visibility.excludedTier}척`:'',visibility.excludedLocation?`지역·플랫폼 제외 ${visibility.excludedLocation}척`:'',visibility.missingBoat?`선박 정보 없음 ${visibility.missingBoat}척`:''].filter(Boolean);
  $('#tier-hidden-reasons').textContent=(visibility.total?`저장 티어 중 조회 대상 ${visibility.included}척${hiddenReasons.length?' · '+hiddenReasons.join(' · '):''}. 조회 결과와 저장된 티어 목록은 별개입니다.`:'이 기기에 저장된 티어가 없습니다. 티어·백업 확인에서 제공한 백업과 비교할 수 있습니다.')+(visibility.unassignedSelected?` 별도로 선택된 미분류 ${visibility.unassignedSelected}척은 기타 조건으로 조회합니다.`:'');
  const catalog=(fleetSeed as {catalog?:{checkedAt:string;listed:number}}).catalog;
  $('#fleet-catalog-status').textContent=`더피싱 보유 목록 ${allCounts.thefishing}개${catalog ? ` · 최근 원본 확인 ${catalog.listed}개 (${new Date(catalog.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})})`:''}. 선상24 보유 목록 ${allCounts.sunsang24}개 · PC 누적 목록과 검증된 공개 선사 목록. 두 목록은 매주 월요일 갱신을 시도하며 실패한 출처의 기존 항목은 보존합니다. 중앙 API 접근 제한·원본 페이지 중복으로 전국 완전 수집을 보장하지 않습니다. 같은 플랫폼·ID는 한 번 집계하며 플랫폼 간 동일 선박 후보는 예약정보를 합치지 않습니다. 새 목록 항목은 기타 티어·선택 해제 상태이며 기존 개인 티어·선택은 유지됩니다.`;
  renderTideSummary($('#tide-status'),calculateTideMonth(shown.month,shown.tideDays || []));
  if (!selectedDay.startsWith(shown.month)) selectedDay = records[0]?.date || `${shown.month}-01`;
  $<HTMLInputElement>('#month').value = shown.month; $<HTMLInputElement>('#people').value=String(shown.requiredPeople); $('#month-label').textContent = `${shown.month.slice(0, 4)}년 ${Number(shown.month.slice(5))}월`;
  // Species renderer retains disclosure and logical keyboard position itself.
  const speciesCounts=queryMonth(shown,{month:shown.month,requiredPeople:shown.requiredPeople,tier,search:'',matchingOnly:false}).rawSpeciesCounts;
  const speciesReason=liveController?'선박 조회 중입니다. 완료 후 수집된 어종을 선택할 수 있습니다.':!speciesCounts.size ? (liveRows.length || savedMode()?'현재 월·지역·티어에 어종을 선택할 출조 정보가 없습니다.':'먼저 조회하기를 눌러 출조 정보를 불러오세요.') : '';
  renderSpeciesFilter($('#species-filter'),speciesCounts,state.selectedSpecies || 'all',state.excludedSpeciesKeys || [],(selectedSpecies,excludedSpeciesKeys)=>{
    resultLimit=50;void commit({...state,selectedSpecies,excludedSpeciesKeys},'어종 필터를 적용했습니다. 원본 조회 결과는 유지합니다.');
  },speciesReason,result.speciesCounts);
  const chosenSpecies=speciesOptions(state.selectedSpecies);
  $('#species-toggle-label').textContent=speciesReason ? (liveController?'어종 · 조회 중':'어종 · 조회 후 선택'):`어종 · ${chosenSpecies==='all'?'전체':chosenSpecies.length+'개 선택'}`;
  // The disclosure remains operable so the disabled choices' reason is readable.
  $('#species-toggle-label').setAttribute('aria-describedby','species-selection-summary');
  $('#species-toggle').dataset.available=String(!speciesReason);
  $('#published-preferences-status').textContent=`제공한 기본 분류 · ${TIERS.map(t=>`${LABELS[t]} ${PUBLISHED_PREFERENCES_COUNTS[t]}척`).join(' / ')} · 이후 개인 수정은 유지됩니다.`;
  $('#reservation-filter-summary').textContent=regionSummary(state.selectedRegion);
  $('#region-toggle').classList.toggle('has-selection',regionSummary(state.selectedRegion)!=='전체 지역');
  $('#tier-selection-summary').textContent=`티어 · ${tier==='all'?'전체':tierFilterLabel(tier)}`;
  const restoreStatus=retainDisclosureUi($('#query-status'),()=>$('#booking-heading'));
  $('#query-status').replaceChildren();
  const fresh=(shown.monthChecks || []).filter(c=>c.month===shown.month && (c.source==='direct' || c.source==='api') && Date.now()-Date.parse(c.observedAt)<600000 && result.boats.some(b=>b.uid===c.uid)).length;
  $('#query-status').append(el('strong',demo ? '예시 조회 결과' : savedMode() ? '이전 자료 열람 · 현재 잔여석이 아닙니다' : `이번 조회 ${fresh}척 · 미확인 ${result.missingBoats.length}척`),el('p',result.latest ? `자료 기준 ${new Date(result.latest).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 현재 잔여석은 공식 페이지에서 확인하세요.` : savedMode() ? '이 월의 저장 자료가 없습니다.' : '실시간 월 조회를 누르면 원본의 잔여석을 새로 확인합니다.'));
  if (result.missingBoats.length) { const missing=el('details');missing.id='missing-boats'; missing.append(el('summary',`미확인 선박 ${result.missingBoats.length}척 보기`),el('p',result.missingBoats.map(b=>b.name).join(' · '))); $('#query-status').append(missing); }
  if (result.failures.length) $('#query-status').append(el('p',`${result.failures.length}척에 수집 실패 이력이 있습니다. 현재 예약 가능 여부는 확인되지 않았습니다.`,'notice'));
  const sunsang=result.boats.filter(b=>boatPlatform(b)==='sunsang24'),linked=sunsang.filter(b=>publicRouteForBoat(b.uid)).length;
  if(sunsang.length) $('#query-status').append(el('p',`선상24 선택 ${sunsang.length}척 중 공개 예약표 연동 ${linked}척${linked<sunsang.length?` · 주소 미확인 ${sunsang.length-linked}척은 공식 페이지 확인 필요`:''}`));
  restoreStatus();
  $('#archive-months').replaceChildren();
  for (const month of [...new Set([...state.events.map(e=>e.date.slice(0,7)),...(state.monthChecks || []).map(c=>c.month)])].sort()) {
    const b=el('button',`${month.slice(0,4)}년 ${Number(month.slice(5))}월 자료`);b.dataset.focusKey=`archive:${month}`; b.setAttribute('aria-pressed',String(month===state.month)); b.addEventListener('click',()=>{$<HTMLSelectElement>('#query-mode').value='saved';$('#query-mode').dispatchEvent(new Event('change'));void setMonth(month);}); $('#archive-months').append(b);
  }
  $('#live-diagnostics').hidden=!liveRows.length;
  renderDiagnostics($('#live-rows'),liveRows);
  renderPlatformResults();
  $('#demo-banner').hidden = !demo; $('#demo').textContent = demo ? '실제 조회 자료로 돌아가기' : '예시 둘러보기'; $('#fleet-section').hidden = demo;$('#manage-tier-boats').hidden=demo;
  $('#tabs').replaceChildren();
  const allTiers=TIERS.every(t=>matchesTier(t,tier));
  for (const t of ['all', ...TIERS, 'none'] as const) {
    const checked=t==='all'?allTiers:t==='none'?Array.isArray(tier)&&!tier.length:!allTiers && matchesTier(t,tier);
    const b=el('button',`${checked?'✓ ':''}${t==='none'?'해제':LABELS[t]}`);b.type='button';b.dataset.tier=t;b.setAttribute('aria-pressed',String(checked));b.setAttribute('aria-label',t==='all'?'모든 티어 조회':t==='none'?'조회할 티어 선택 해제':`${LABELS[t]} ${allTiers?'조회 시작':'조회 선택'} · 기기 저장 ${visibility.counts[t]}척`);
    b.addEventListener('click',()=>{void commit({...state,selectedTiers:toggleTierFilter(tier,t)},'조회할 티어를 변경했습니다. 선박에 지정한 티어는 유지합니다.');});$('#tabs').append(b);
  }
  $('#source-access').hidden = demo;
  renderSourceAccess($('#source-access'), tierQueryState(state), sourceBoat, value => { sourceBoat=value; render(); });
  renderResults(shown,result);
  // Saves clone state. Compare fleet values so a month/tide change doesn't rebuild every row.
  const fleetKey=JSON.stringify([state.boats,state.tiers,state.selectedUids,state.selectedRegion,state.selectedPlatform,fleetSort]);
  if(lastFleetKey!==fleetKey) {renderFleet();lastFleetKey=fleetKey;}
  connection();if(busy) setBusy(true);restoreFocus();
}
$<HTMLInputElement>('#import').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement, files = [...(input.files || [])]; if (!files.length || busy) return;
  importController = new AbortController(); const { signal } = importController; setBusy(true); $('#cancel').hidden = false; say('자료를 확인하고 있습니다…');
  try {
    let c = structuredClone(state); const warnings: string[] = [];
    for (const file of files) { if (file.size > 20_000_000) throw new Error('20MB 이하 JSON을 선택하세요.'); const data = JSON.parse(await file.text()); signal.throwIfAborted(); if(isTierBackup(data)) c=restoreTierBackup(data,c).state; else {const r = importData(data, c); c = r.state; warnings.push(...r.warnings);} }
    // An explicit personal restore takes precedence over the already offered published preset.
    c.publishedPreferencesVersion=PUBLISHED_PREFERENCES_VERSION;
    c.preferenceRecoveryVersion=RECOVERY_VERSION; // Respect an explicitly imported empty personal tier list on later reloads.
    signal.throwIfAborted(); await saveState(c, signal); state = c; demo = false; selectedDay = state.events.find(e => e.date.startsWith(state.month))?.date || `${state.month}-01`; undoState = null; $('#undo').hidden = true;
    say(`가져오기 완료 · ${files.length}개 파일. ${warnings.slice(0, 4).join(' ')}`);
  } catch (error) { say(signal.aborted ? '가져오기를 취소했습니다. 기존 자료를 유지합니다.' : `가져오지 못했습니다. ${error instanceof Error ? error.message : 'JSON 형식을 확인하세요.'}`); }
  finally { input.value = ''; importController = null; $('#cancel').hidden = true; setBusy(false); render(); }
});
$('#query-form').addEventListener('submit',async event=>{
  event.preventDefault(); if (busy) return;
  const month=$<HTMLInputElement>('#month').value, requiredPeople=Number($<HTMLInputElement>('#people').value);
  try { queryMonth(state,{month,requiredPeople,tier,search,matchingOnly}); } catch (error) { querySession={...beginQuerySession(state,tier,'error'),issue:'invalid',message:error instanceof Error ? error.message : '조회 조건을 확인하세요.'};render();finishFilterPanels(root,'error','invalid');say(querySession.message!); return; }
  const candidate={...state,month,requiredPeople}; resultLimit=50;if(!selectedDay.startsWith(month)) selectedDay=`${month}-01`;
  if(demo || $<HTMLSelectElement>('#query-mode').value==='saved') {if(await commit(candidate,'저장된 월별 자료를 조건 검색했습니다.')) finishFilterPanels(root,queryMonth(active(),{month,requiredPeople,tier,search,matchingOnly}).events.length?'success':'empty');else finishFilterPanels(root,'error');return;}
  const boats=tierQueryBoats(candidate,tier);
  if(!boats.length) {querySession={...beginQuerySession(candidate,tier,'error'),issue:'scope'};render();finishFilterPanels(root,'error','scope');say('선택한 지역·티어에 조회할 선박이 없습니다. 티어 선박 관리에서 티어를 등록하거나 지역·티어 조건을 변경하세요.');return;}
  liveRows=[];liveMonth=month;queryBoats=boats;querySession=null;progress.reset();delete $('#query-monitor').dataset.scope;render();
  if(!navigator.onLine) {querySession={...beginQuerySession(candidate,tier,'error'),issue:'offline',message:'오프라인입니다. 현재 잔여석을 확인할 수 없습니다. 연결 후 다시 조회하세요.'};render();finishFilterPanels(root,'error','offline');say(querySession.message!);return;}
  const useApi=$<HTMLSelectElement>('#query-mode').value==='api';
  if(useApi && !configuredApi) {querySession={...beginQuerySession(candidate,tier,'error'),issue:'api',message:'조회 API를 먼저 연결하세요. API 주소를 입력하고 연결 확인 및 저장을 누르세요.'};render();finishFilterPanels(root,'error','api');say(querySession.message!);$<HTMLDetailsElement>('#api-settings').open=true;$<HTMLInputElement>('#api-url').focus();return;}
  const provider=new IntegratedProvider(useApi ? apiProvider:directProvider,new Sunsang24PublicApi(configuredApi));
  const restoreQueryFocus=retainFocus(root,()=>$('#query-submit'));
  const started=performance.now();
  const requestSession=beginQuerySession(candidate,tier);
  querySession=requestSession;liveController=new AbortController();livePreview=candidate;finishFilterPanels(root,'loading');render();setBusy(true); $('#stop-query').hidden=false;progress.start(boats.length);$('#query-monitor').dataset.scope=requestSession.scope;
  $('#live-diagnostics').hidden=true;$('#diagnostic-text').hidden=true;
  $('#live-progress').textContent=`${boats.length}척 조회 시작 · 완료된 선박부터 달력에 표시합니다.`;
  liveStatus.say(`${month} · ${boats.length}척 실시간 조회를 시작합니다.`);
  const applied=new Set<string>(),preview=createLivePreview(candidate,month),pendingPreview:LiveRow[]=[];
  let previewTimer:ReturnType<typeof setTimeout>|undefined,lastPaint=-Infinity,queryOutcome:QueryOutcome='error';
  const paint=()=>{previewTimer=undefined;if(livePreview) {livePreview=preview.append(pendingPreview.splice(0));renderResults(active());lastPaint=performance.now();}};
  try {
    const result=await collectMonth(provider,boats,month,liveController.signal,(rows,total)=>{
      liveRows=rows;progress.update(rows.length,rows.filter(row=>row.result.status==='ALLOWED_READABLE').length);const delta=rows.filter(row=>!applied.has(row.boat.uid)),last=delta.at(-1)!;
      renderPlatformResults();
      for(const row of delta) applied.add(row.boat.uid);
      pendingPreview.push(...delta);
      $('#live-progress').textContent=`${rows.length}/${total}척 확인 · ${last.boat.name} · 달력에 순차 반영 중`;
      liveStatus.progress(`${total}척 중 ${rows.length}척 응답 · 성공 ${rows.filter(row=>row.result.status==='ALLOWED_READABLE').length}척`);
      // Dispatch the next request before DOM work; fast responses share one paint.
      if(!previewTimer) previewTimer=setTimeout(paint,Math.max(0,250-(performance.now()-lastPaint)));
    },useApi ? {perPlatform:3}:1);
    if(previewTimer) clearTimeout(previewTimer);
    const updated=applyLiveResults(candidate,month,result.rows); await saveState(updated);state=updated;undoState=null;$('#undo').hidden=true;
    const ok=result.rows.filter(r=>r.result.status==='ALLOWED_READABLE').length, failed=result.rows.length-ok, unattempted=result.total-result.rows.length;
    const complete=!result.cancelled && !result.stopped && !failed && !unattempted;
    queryOutcome=complete ? queryMonth(tierQueryState(updated),{month,requiredPeople,tier,search,matchingOnly}).events.length?'success':'empty':result.cancelled?'cancelled':ok?'partial':'error';
    querySession={...requestSession,outcome:queryOutcome,counts:requestCounts(boats,result.rows)};
    const outcome=result.cancelled ? '조회 취소' : result.stopped ? '조회 중단' : failed || unattempted ? ok?'조회 일부 완료':'조회 실패':'조회 완료';progress.finish(outcome);
    const status=`${outcome} · 성공 ${ok}척 · 실패/미지원 ${failed}척 · 미조회 ${unattempted}척 · ${((performance.now()-started)/1000).toFixed(1)}초`;
    $('#live-progress').textContent=status; say(status+' · 이번에 확인한 잔여석만 표시합니다.');
  } catch(error) {const counts=requestCounts(queryBoats,liveRows);liveRows=[];queryOutcome='error';querySession={...requestSession,outcome:'error',issue:'storage',counts,message:'조회 결과를 기기에 반영하지 못했습니다. 이전 잔여석은 표시하지 않습니다. 다시 조회하세요.'};progress.finish('조회 실패');$('#live-progress').textContent='최신 잔여석을 반영하지 못했습니다. 다시 조회하세요.';say(`조회 결과를 반영하지 못했습니다. ${error instanceof Error ? error.message : '다시 조회하세요.'}`);}
  finally {if(previewTimer) clearTimeout(previewTimer);const cancelledFocus=document.activeElement===$('#stop-query');livePreview=null;liveController=null;$('#stop-query').hidden=true;setBusy(false);render();finishFilterPanels(root,queryOutcome,querySession?.issue);if(cancelledFocus) $('#query-submit').focus({preventScroll:true});else restoreQueryFocus();if(liveRows.some(row=>row.result.status!=='ALLOWED_READABLE')) $<HTMLDetailsElement>('#live-diagnostics').open=true;}
});
$('#copy-diagnostics').addEventListener('click',async()=>{
  const report=diagnosticReport(liveRows,liveMonth), fallback=$<HTMLTextAreaElement>('#diagnostic-text');
  try {await navigator.clipboard.writeText(report);say('조회 진단을 복사했습니다. 오류 확인에 이 내용을 사용할 수 있습니다.');}
  catch {fallback.value=report;fallback.hidden=false;fallback.focus();fallback.select();say('아래 진단 내용을 길게 눌러 복사하세요.');}
});
$('#stop-query').addEventListener('click',()=>{liveController?.abort();});
$('#query-mode').addEventListener('change',()=>{$('#query-submit').textContent=$<HTMLSelectElement>('#query-mode').value==='saved' ? '저장 자료 검색':'조회하기';render();});
$('#api-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy) return;setBusy(true);
  try {const origin=await checkApi($<HTMLInputElement>('#api-url').value);saveApiOrigin(origin);configuredApi=origin;apiProvider=new TheFishingApi(origin);renderApiSettings();say('조회 API 연결을 확인했습니다. 월과 인원을 선택하고 실시간 월 조회를 누르세요.');}
  catch(error) {say(`API를 연결하지 못했습니다. ${error instanceof Error ? error.message:''}`);}
  finally {setBusy(false);}
});
$('#api-clear').addEventListener('click',()=>{if(busy) return;try {clearApiOrigin();configuredApi='';renderApiSettings();say('이 기기의 API 연결을 해제했습니다.');} catch {say('기기 설정을 변경하지 못했습니다.');}});
$('#matching-only').addEventListener('change',event=>{matchingOnly=(event.currentTarget as HTMLInputElement).checked; resultLimit=50; render();});
$('#search').addEventListener('input',event=>{search=(event.currentTarget as HTMLInputElement).value;resultLimit=50;render();});
$('#search-clear').addEventListener('click',()=>{search='';$<HTMLInputElement>('#search').value='';resultLimit=50;render();$('#search').focus({preventScroll:true});});
$('#tier-show-all').addEventListener('click',()=>{void commit({...state,selectedTiers:'all',selectedPlatform:'all',selectedRegion:emptyRegion(),selectedSpecies:'all',excludedSpeciesKeys:[]},'조회 필터를 해제했습니다. 저장된 티어는 유지합니다. 새 잔여석은 조회하기를 눌러 확인하세요.');});
$('#tier-open-recovery').addEventListener('click',()=>{$<HTMLDetailsElement>('.fleet-management').open=true;});
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
async function setMonth(value: string) { if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(value)) return; if(busy) return;const c = structuredClone(state); c.month = value; resultLimit=50;if(value!==state.month) {liveRows=[];queryBoats=[];progress.reset();c.selectedSpecies='all';c.excludedSpeciesKeys=[];}await commit(c, '조회 월을 변경했습니다. 조회하기를 눌러 새 잔여석을 확인하세요.'); }
$<HTMLInputElement>('#people').addEventListener('change',event=>{
  const requiredPeople=Number((event.currentTarget as HTMLInputElement).value);
  if(busy || !Number.isInteger(requiredPeople) || requiredPeople<1 || requiredPeople>100 || requiredPeople===state.requiredPeople) return;
  // Draft form value; the query/save persists it. Do not disable the submit on blur.
  state={...state,requiredPeople};render();say('출조 인원을 변경했습니다. 조회하기를 눌러 현재 조건을 확인하세요.');
});
$<HTMLInputElement>('#month').addEventListener('change', e => { void setMonth((e.currentTarget as HTMLInputElement).value); });
for (const [id, offset] of [['prev', -1], ['next', 1]] as const) $('#' + id).addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); void setMonth(new Date(Date.UTC(y, m - 1 + offset)).toISOString().slice(0, 7)); });
$('#platform-filter').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-platform]');if(!button || busy) return;const selectedPlatform=readPlatform(button.dataset.platform);resultLimit=50;void commit({...state,selectedPlatform},`${PLATFORM_LABELS[selectedPlatform]} 선박과 조회 결과를 표시합니다. 추가 수집은 하지 않습니다.`);});
$<HTMLSelectElement>('#fleet-sort').addEventListener('change',event=>{fleetSort=(event.currentTarget as HTMLSelectElement).value;renderFleet();});
$<HTMLInputElement>('#fleet-search').addEventListener('input', e => { fleetSearch = (e.currentTarget as HTMLInputElement).value.trim(); renderFleet(); });
let formReturnKey='';
function closeForm(returnFocus=true) {const owned=form.contains(document.activeElement) || document.activeElement===document.body;form.hidden=true;editing=null;form.reset();field('uid').readOnly=false;if(returnFocus && owned) {const previous=[...root.querySelectorAll<HTMLElement>('[data-focus-key]')].find(node=>node.dataset.focusKey===formReturnKey);(canFocus(previous)?previous:$('#add-toggle')).focus({preventScroll:true});}formReturnKey='';}
$('#add-toggle').addEventListener('click', () => { closeForm(false); form.hidden = false; field('uid').focus(); }); $('#edit-cancel').addEventListener('click',()=>closeForm());
form.addEventListener('keydown',event=>{if(event.key==='Escape' && !busy) {event.preventDefault();event.stopPropagation();closeForm();}});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const id = field('uid').value.trim(), name = text(field('name').value, 100), port = text(field('port').value, 100), raw = field('url').value.trim(), url = reservationLink(raw, id);
  if ((!editing && !/^\d{1,20}$/.test(id)) || !name || (raw && !url)) { say('숫자 UID, 선박 이름, 저장된 선박과 일치하는 공식 HTTPS URL을 확인하세요.'); return; }
  const c = structuredClone(state), index = c.boats.findIndex(b => b.uid === id);
  if (index >= 0 && !editing) { say('이미 등록한 UID입니다. 목록의 수정 버튼을 이용하세요.'); return; }
  if (index >= 0) c.boats[index] = { uid: id, name, port, url,region:readRegion({sea:field('sea').value,province:field('province').value,local:field('local').value}) }; else { c.boats.push({ uid: id, name, port, url,region:readRegion({sea:field('sea').value,province:field('province').value,local:field('local').value}) }); c.selectedUids.push(id); }
  if (index < 0 || !TIERS.some(t=>c.tiers[t].includes(id)) || tierFor(c, id) !== field('tier').value) moveBoat(c, id, field('tier').value as Tier);
  if (await commit(c, '선박 정보를 저장했습니다.')) closeForm();
});
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
window.addEventListener('online', ()=>{connection();if(!busy) render();}); window.addEventListener('offline', ()=>{connection();if(!busy) render();});
setBusy(true);
try {
  const saved=await loadState();storageReady=true;
  const prepared=initializeFleet(saved),archive=initializeMonthlyArchive(prepared.state);
  state=archive.state; // Keep readable personal data visible if creating the migration backup fails.
  const next=applyPublishedPreferences(archive.state,prepared.seeded),changed=next!==archive.state;
  if(changed) await backupPreferences(archive.state,PUBLISHED_PREFERENCES_VERSION);
  const recovered=initializePreferenceRecovery(next,saved!==undefined),recoveryChanged=recovered.state!==next;
  const tideDays=mergeTideDays(tideArchive.days,next.tideDays),tidesChanged=JSON.stringify(tideDays)!==JSON.stringify(next.tideDays);
  const candidate={...recovered.state,tideDays,month:localMonth(),selectedPlatform:'all' as const,...(recovered.state.month===localMonth()?{}:{selectedSpecies:'all' as const,excludedSpeciesKeys:[]})};
  if(prepared.changed || archive.changed || tidesChanged || changed || recoveryChanged) await saveState(candidate);
  state=candidate;
  selectedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());liveMonth=state.month;
  if(changed) say(prepared.seeded?'제공한 티어·선택 목록을 처음 적용했습니다.':'기존 개인 티어·선택을 보존하고 설정 보호를 적용했습니다.');
  if(recovered.restored) say(`티어 ${recovered.restored}개를 제공한 마지막 백업 기준으로 적용했습니다. 복원 전 설정은 자동 보호 이력에 보관했습니다.`);
} catch {say('기기 설정을 읽거나 저장하지 못했습니다. 백업 파일을 확인해 주세요.');}
finally {setBusy(false);render();if(!storageReady) {setBusy(true);say('기기 설정을 읽지 못해 변경과 저장을 중지했습니다. 저장소를 지우지 말고 새로고침해 주세요.');}}
if(storageReady) refreshRecovery=installPreferenceRecovery($('.fleet-management'),()=>state,commit,say);
$('#restore-before-publish').addEventListener('click',async()=>{
  if(busy) return;
  try {
  const previous=await previousPreferences(PUBLISHED_PREFERENCES_VERSION);
  if(!previous) {say('이 기기에 배포 전 설정 백업이 없습니다.');return;}
  const ids=new Set(state.boats.map(b=>b.uid)),candidate={...state,tiers:structuredClone(previous.tiers),selectedUids:previous.selectedUids.filter(id=>ids.has(id))};
  for(const tier of TIERS) candidate.tiers[tier]=candidate.tiers[tier].filter(id=>ids.has(id));
  await commit(candidate,'기존 티어·선택을 복원했습니다. 최신 조회 자료는 유지합니다.');
  } catch {say('기기 백업을 읽지 못했습니다. 현재 티어·선택은 유지합니다.');}
});
// Refresh freshness labels while visible; this never makes a network request.
setInterval(()=>{if(!busy && document.visibilityState==='visible') render();},60000);
$('#apply-update').addEventListener('click',()=>{if(!busy) location.reload();});
if ('serviceWorker' in navigator && import.meta.env.PROD) void watchAppUpdates(navigator.serviceWorker,import.meta.env.BASE_URL,()=>{$('#app-update').hidden=false;liveStatus.say('새 버전이 준비되었습니다. 저장된 선박과 티어는 유지됩니다.');}).catch(()=>{say('화면 업데이트 확인에 실패했습니다. 온라인에서 새로고침해 주세요.');});
