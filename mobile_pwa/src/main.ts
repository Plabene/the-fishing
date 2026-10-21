import './style.css';
import { emptyState, LABELS, TIERS, reservationLink, text, type AppState, type Filter, type Tier } from './models';
import { importData, exportData } from './importLegacy';
import { loadState, saveState } from './availabilityStore';
import { orderedBoats, moveBoat, removeBoat, tierFor } from './tierStore';
import { renderCalendar, visibleEvents } from './calendarView';
import { el, renderDay, sourceLink } from './dayView';
import { fixtureState } from './providers/fixtures';
import { LIVE_ENABLED } from './provider';
import { initializeFleet, applyDefaultFleet } from './defaultFleet';
import { renderSourceAccess } from './sourceAccess';
const root = document.querySelector<HTMLDivElement>('#app')!;
// Only static markup is inserted here. All imported content uses textContent/value.
root.innerHTML = `<header class="hero"><div class="hero-inner"><div class="brand"><span class="brand-mark" aria-hidden="true">≈</span><span>THEFISHING<small>나의 출조 노트</small></span></div><div class="hero-row"><div><p class="eyebrow">기록을 모으고, 다음 출조를 준비하세요</p><h1>내 출조 달력</h1><p>내 선박, 내 순서. 보관한 기록을 한눈에.</p></div><span id="connectivity"></span></div></div></header>
<main><section class="data-bar" aria-label="자료 관리"><div><strong>내 변경사항은 이 기기에 저장합니다</strong><p>PC 선박 목록과 선택·티어를 기본으로 제공합니다. 출조 기록은 JSON으로 가져올 수 있습니다.</p></div><div class="actions"><label class="button primary">JSON 가져오기<input id="import" type="file" accept=".json,application/json" multiple></label><button id="export">백업 저장</button><button id="demo">예시 둘러보기</button><button id="restore-fleet">PC 선박 목록 적용</button></div></section>
<div class="message-row"><p id="message" role="status" aria-live="polite"></p><button id="cancel" hidden>가져오기 취소</button><button id="undo" hidden>변경 되돌리기</button></div>
<section id="source-access" class="source-access" aria-label="공식 예약 페이지 확인"></section>
<section class="calendar-shell" aria-label="출조 달력"><div class="section-heading"><div><p class="eyebrow dark">나의 기록</p><h2 id="month-label"></h2></div><div class="month-controls"><button id="prev" aria-label="이전 달">‹</button><label class="sr-only" for="month">출조 월</label><input id="month" type="month" min="2000-01" max="2099-12"><button id="next" aria-label="다음 달">›</button></div></div>
<div class="filters"><div id="tabs" class="tier-tabs" role="group" aria-label="선박 티어"></div><label class="search-label"><span class="sr-only">선박 또는 출조 검색</span><input id="search" type="search" placeholder="선박 · 항구 · 출조 검색"></label></div><p id="summary" class="summary"></p><div id="demo-banner" class="demo-banner" hidden>가상의 예시 자료입니다. 실제 선박·잔여석 정보가 아니며 내 자료에 저장되지 않습니다.</div><div class="calendar-grid-layout"><div><div id="calendar" class="calendar-grid" aria-label="월별 날짜"></div><p class="legend">숫자는 저장된 기록 수입니다. 이전 자료는 현재 예약 가능 여부를 보장하지 않습니다.</p><p id="last-observed" class="timestamp"></p></div><section id="day-view" class="day-view" aria-live="polite"></section></div></section>
<section id="fleet-section" class="fleet-section"><div class="section-heading"><div><p class="eyebrow dark">기기별 설정</p><h2>내 선박 관리</h2></div><button id="add-toggle">+ 선박 추가</button></div><p class="muted">달력에 포함할 선박을 선택하고 티어와 순서를 바꾸세요. 다른 기기와 자동으로 동기화되지 않습니다.</p><form id="boat-form" class="boat-form" hidden><label>선박 UID<input name="uid" inputmode="numeric" required maxlength="80" placeholder="실제 선박의 숫자 UID"></label><label>선박 이름<input name="name" required maxlength="100"></label><label>항구<input name="port" maxlength="100"></label><label class="url-field">공식 상세 URL (선택)<input name="url" type="url" placeholder="https://thefishing.kr/reservation/list.php?uid=…"></label><label>티어<select name="tier"><option value="tier1">1티어</option><option value="tier2">2티어</option><option value="tier3">3티어</option><option value="other">기타</option></select></label><div class="actions"><button type="submit" class="primary">선박 저장</button><button type="button" id="edit-cancel">닫기</button></div></form><div class="fleet-tools"><label>목록 검색<input id="fleet-search" type="search" placeholder="이름 또는 UID"></label><span id="fleet-count"></span><button id="select-all">전체 선택</button><button id="select-none">전체 해제</button></div><div id="boats"></div></section>
<details class="about"><summary>자료 상태와 오프라인 사용 안내</summary><p><strong>실시간 조회: 미검증 · 비활성화</strong></p><p>운영자 허가와 실제 Android·iOS 교차 출처 검증이 없어 외부 사이트를 자동 조회하지 않습니다. 가져온 좌석은 이전 자료이며, 알 수 없는 값은 마감으로 표시하지 않습니다.</p><p>한 번 열린 화면과 저장 자료는 오프라인에서 다시 볼 수 있습니다. 브라우저 저장소를 지우면 자료가 사라지므로 백업을 보관하세요. 앱을 닫은 상태의 자동 새로고침은 제공하지 않습니다.</p><p>관리 기능은 이 기기의 설정입니다. 중앙 관리자 계정과 기기 간 자동 동기화는 없습니다. 공식 페이지 링크는 새 탭에서 열립니다.</p></details></main><footer>내 출조 달력 · 읽기 전용 기록 도구<span>예약·로그인·결제 기능 없음</span></footer>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let state = emptyState(), tier: Filter = 'all', search = '', fleetSearch = '', demo = false;
let selectedDay = `${state.month}-01`, busy = false, editing: string | null = null;
let sourceBoat = '';
let importController: AbortController | null = null, undoState: AppState | null = null;
const form = $<HTMLFormElement>('#boat-form');
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const say = (value: string) => { $('#message').textContent = value; };
const active = () => demo ? fixtureState(state.month) : state;
function connection() { $('#connectivity').textContent = navigator.onLine ? '● 온라인 · 자료는 기기에 보관' : '○ 오프라인 · 저장 자료 열람'; }
function setBusy(value: boolean) { busy = value; root.setAttribute('aria-busy', String(value)); root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(n => { if (n.id !== 'cancel') n.disabled = value; }); }
async function commit(candidate: AppState, message: string): Promise<boolean> {
  if (busy) return false; setBusy(true);
  try { await saveState(candidate); state = candidate; undoState = null; $('#undo').hidden = true; say(message); return true; }
  catch { say('기기에 저장하지 못했습니다. 저장 공간을 확인하거나 백업을 내려받으세요. 변경은 적용되지 않았습니다.'); return false; }
  finally { setBusy(false); render(); }
}
function chooseDay(day: string) { selectedDay = day; renderCalendar($('#calendar'), active(), tier, search, day, chooseDay); renderDay($('#day-view'), active(), day, tier, search); }
function renderFleet() {
  const target = $('#boats'); target.replaceChildren();
  const boats = orderedBoats(state).filter(b => `${b.name} ${b.uid} ${b.port}`.toLowerCase().includes(fleetSearch.toLowerCase()));
  $('#fleet-count').textContent = `${state.selectedUids.length}척 선택 / 전체 ${state.boats.length}척`;
  if (!boats.length) target.append(el('p', state.boats.length ? '검색 결과가 없습니다.' : '아직 등록한 선박이 없습니다. JSON을 가져오거나 선박을 추가하세요.', 'empty'));
  for (const boat of boats.slice(0, 200)) {
    const row = el('article', '', 'boat-row'), info = el('div', '', 'boat-info'), label = el('label', '', 'boat-selection'), check = el('input');
    check.type = 'checkbox'; check.checked = state.selectedUids.includes(boat.uid); check.setAttribute('aria-label', `${boat.name} 달력에 포함`);
    check.addEventListener('change', () => { const c = structuredClone(state); c.selectedUids = check.checked ? [...new Set([...c.selectedUids, boat.uid])] : c.selectedUids.filter(id => id !== boat.uid); void commit(c, '달력에 표시할 선박을 저장했습니다.'); });
    label.append(check, el('strong', boat.name)); info.append(label, el('p', `${boat.port || '항구 미표시'} · UID ${boat.uid}`, 'muted')); const link = sourceLink(boat.url, boat.uid); if (link) info.append(link);
    const controls = el('div', '', 'boat-actions'), select = el('select'); select.setAttribute('aria-label', `${boat.name} 티어`);
    for (const t of TIERS) { const o = el('option', LABELS[t]); o.value = t; select.append(o); } select.value = tierFor(state, boat.uid);
    select.addEventListener('change', () => { const c = structuredClone(state); moveBoat(c, boat.uid, select.value as Tier); void commit(c, '티어를 저장했습니다.'); }); controls.append(select);
    for (const [caption, offset] of [['↑', -1], ['↓', 1]] as const) { const b = el('button', caption); b.type = 'button'; b.setAttribute('aria-label', `${boat.name} ${offset < 0 ? '위로' : '아래로'}`); b.addEventListener('click', () => { const c = structuredClone(state); moveBoat(c, boat.uid, tierFor(c, boat.uid), offset); void commit(c, '선박 순서를 저장했습니다.'); }); controls.append(b); }
    const edit = el('button', '수정'); edit.addEventListener('click', () => { editing = boat.uid; field('uid').value = boat.uid; field('uid').readOnly = true; field('name').value = boat.name; field('port').value = boat.port; field('url').value = boat.url; field('tier').value = tierFor(state, boat.uid); form.hidden = false; field('name').focus(); });
    const remove = el('button', '삭제', 'quiet-danger'); remove.setAttribute('aria-label', `${boat.name} 삭제`); remove.addEventListener('click', async () => { const previous = structuredClone(state), c = structuredClone(state); removeBoat(c, boat.uid); if (await commit(c, '선박과 해당 기록을 삭제했습니다. 되돌릴 수 있습니다.')) { undoState = previous; $('#undo').hidden = false; } }); controls.append(edit, remove); row.append(info, controls); target.append(row);
  }
  if (boats.length > 200) target.append(el('p', '처음 200척만 표시합니다. 목록 검색으로 범위를 좁히세요.', 'muted'));
}
function render() {
  const shown = active(), records = visibleEvents(shown, tier, search);
  if (!selectedDay.startsWith(state.month)) selectedDay = records[0]?.date || `${state.month}-01`;
  $<HTMLInputElement>('#month').value = state.month; $('#month-label').textContent = `${state.month.slice(0, 4)}년 ${Number(state.month.slice(5))}월`;
  $('#summary').textContent = `${LABELS[tier]} · 선택 선박 ${shown.selectedUids.length}척 · 저장 기록 ${records.length}건`;
  $('#demo-banner').hidden = !demo; $('#demo').textContent = demo ? '내 자료로 돌아가기' : '예시 둘러보기'; $('#fleet-section').hidden = demo;
  const times = records.flatMap(e => e.observedAt ? [e.observedAt] : []).sort((a, b) => Date.parse(b) - Date.parse(a));
  $('#last-observed').textContent = times[0] ? `이 달의 최근 관측 · ${new Date(times[0]).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : '관측 시각 · 확인된 자료 없음';
  $('#tabs').replaceChildren(); for (const t of ['all', ...TIERS] as Filter[]) { const b = el('button', LABELS[t]); b.setAttribute('aria-pressed', String(t === tier)); b.addEventListener('click', () => { tier = t; render(); }); $('#tabs').append(b); }
  $('#source-access').hidden = demo;
  renderSourceAccess($('#source-access'), state, sourceBoat, value => { sourceBoat=value; render(); });
  renderCalendar($('#calendar'), shown, tier, search, selectedDay, chooseDay); renderDay($('#day-view'), shown, selectedDay, tier, search); renderFleet(); connection();
}
$<HTMLInputElement>('#import').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement, files = [...(input.files || [])]; if (!files.length || busy) return;
  importController = new AbortController(); const { signal } = importController; setBusy(true); $('#cancel').hidden = false; say('자료를 확인하고 있습니다…');
  try {
    let c = structuredClone(state); const warnings: string[] = [];
    for (const file of files) { if (file.size > 20_000_000) throw new Error('20MB 이하 JSON을 선택하세요.'); const data = JSON.parse(await file.text()); signal.throwIfAborted(); const r = importData(data, c); c = r.state; warnings.push(...r.warnings); }
    signal.throwIfAborted(); await saveState(c, signal); state = c; demo = false; selectedDay = state.events.find(e => e.date.startsWith(state.month))?.date || `${state.month}-01`; undoState = null; $('#undo').hidden = true;
    say(`가져오기 완료 · ${files.length}개 파일. ${warnings.slice(0, 4).join(' ')}`);
  } catch (error) { say(signal.aborted ? '가져오기를 취소했습니다. 기존 자료를 유지합니다.' : `가져오지 못했습니다. ${error instanceof Error ? error.message : 'JSON 형식을 확인하세요.'}`); }
  finally { input.value = ''; importController = null; $('#cancel').hidden = true; setBusy(false); render(); }
});
$('#cancel').addEventListener('click', () => importController?.abort());
$('#export').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([exportData(state)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'thefishing-offline-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); say('자료를 백업했습니다. 예시 자료는 포함하지 않습니다.'); });
$('#demo').addEventListener('click', () => { demo = !demo; selectedDay = `${state.month}-${demo ? '09' : '01'}`; render(); });
async function setMonth(value: string) { if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(value)) return; const c = structuredClone(state); c.month = value; await commit(c, '출조 월을 변경했습니다.'); }
$<HTMLInputElement>('#month').addEventListener('change', e => { void setMonth((e.currentTarget as HTMLInputElement).value); });
for (const [id, offset] of [['prev', -1], ['next', 1]] as const) $('#' + id).addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); void setMonth(new Date(Date.UTC(y, m - 1 + offset)).toISOString().slice(0, 7)); });
$<HTMLInputElement>('#search').addEventListener('input', e => { search = (e.currentTarget as HTMLInputElement).value.trim(); render(); });
$<HTMLInputElement>('#fleet-search').addEventListener('input', e => { fleetSearch = (e.currentTarget as HTMLInputElement).value.trim(); renderFleet(); });
function closeForm() { form.hidden = true; editing = null; form.reset(); field('uid').readOnly = false; }
$('#add-toggle').addEventListener('click', () => { closeForm(); form.hidden = false; field('uid').focus(); }); $('#edit-cancel').addEventListener('click', closeForm);
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const id = field('uid').value.trim(), name = text(field('name').value, 100), port = text(field('port').value, 100), raw = field('url').value.trim(), url = reservationLink(raw, id);
  if ((!editing && !/^\d{1,20}$/.test(id)) || !name || (raw && !url)) { say('숫자 UID, 선박 이름, 저장된 선박과 일치하는 공식 HTTPS URL을 확인하세요.'); return; }
  const c = structuredClone(state), index = c.boats.findIndex(b => b.uid === id);
  if (index >= 0 && !editing) { say('이미 등록한 UID입니다. 목록의 수정 버튼을 이용하세요.'); return; }
  if (index >= 0) c.boats[index] = { uid: id, name, port, url }; else { c.boats.push({ uid: id, name, port, url }); c.selectedUids.push(id); }
  if (index < 0 || tierFor(c, id) !== field('tier').value) moveBoat(c, id, field('tier').value as Tier);
  if (await commit(c, '선박 정보를 저장했습니다.')) closeForm();
});
for (const [id, include] of [['select-all', true], ['select-none', false]] as const) $('#' + id).addEventListener('click', () => { const c = structuredClone(state); c.selectedUids = include ? c.boats.map(b => b.uid) : []; void commit(c, '달력 선박 선택을 저장했습니다.'); });
$('#undo').addEventListener('click', async () => { if (undoState) await commit(undoState, '이전 상태로 되돌렸습니다.'); });
$('#restore-fleet').addEventListener('click', async () => { const previous=structuredClone(state); if (await commit(applyDefaultFleet(state), 'PC 선박 목록과 선택·티어를 적용했습니다. 기존 출조 기록은 유지합니다.')) { undoState=previous; $('#undo').hidden=false; } });
window.addEventListener('online', connection); window.addEventListener('offline', connection);
setBusy(true); try { const prepared=initializeFleet(await loadState()); state=prepared.state; if (prepared.changed) await saveState(state); if (prepared.seeded) say(`PC 선박 목록 승계 완료 · 전체 ${state.boats.length}척 · 선택 ${state.selectedUids.length}척. 티어와 순서를 유지했습니다.`); } catch { say('저장 자료를 읽거나 저장하지 못했습니다. PC 선박 목록 적용 또는 백업 JSON 가져오기를 이용하세요.'); } finally { setBusy(false); render(); }
if (LIVE_ENABLED) throw new Error('This distribution must remain offline-only');
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { say('오프라인 화면 저장에 실패했습니다. 연결된 상태에서 다시 열어 주세요.'); });
