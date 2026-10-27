import type {AppState,Boat,Filter} from './models';
import type {LiveRow} from './liveQuery';
import type {QueryOutcome} from './filterPanels';
import type {queryMonth} from './monthlyQuery';
import {regionSummary} from './regions';
import {tierFilterLabel} from './tierStore';
import {PLATFORM_LABELS} from './platforms';
import {FRESH_MS} from './availabilityStore';

export interface QuerySession {
  month:string;
  outcome:QueryOutcome;
  issue?:'scope'|'offline'|'api'|'invalid'|'storage';
  message?:string;
  counts?:ReturnType<typeof requestCounts>;
}
const LABELS:Record<QueryOutcome,string>={loading:'조회 중',success:'완료',empty:'완료',partial:'일부 완료',error:'실패',cancelled:'취소'};
export function requestCounts(boats:Boat[],rows:LiveRow[]) {
  const ids=new Set(boats.map(b=>b.uid)),responses=new Map(rows.filter(r=>ids.has(r.boat.uid)).map(r=>[r.boat.uid,r.result]));
  const success=[...responses.values()].filter(r=>r.status==='ALLOWED_READABLE').length;
  return {total:ids.size,success,failed:responses.size-success,unqueried:ids.size-responses.size};
}
function setText(node:HTMLElement,value:string) {if(node.textContent!==value) node.textContent=value;}

/** Presentation only: request counts are separate from the current scope and cached history. */
export function renderQueryFeedback(root:HTMLElement,state:AppState,result:ReturnType<typeof queryMonth>,tier:Filter,session:QuerySession|null,boats:Boat[],rows:LiveRow[],mode:'live'|'saved'|'demo') {
  const get=(id:string)=>root.querySelector<HTMLElement>('#'+id)!;
  const current=session?.month===state.month ? session:null;
  const noTargets=!result.boats.length,history=mode!=='live';
  const issue=current?.issue==='scope' && !noTargets ? undefined:current?.issue;
  const outcome=current?.issue==='scope' && !noTargets ? undefined:current?.outcome;
  const counts=current?.counts ?? requestCounts(boats,rows);
  setText(get('query-result-scope'),`${regionSummary(state.selectedRegion)} · ${tierFilterLabel(tier)} · ${PLATFORM_LABELS[state.selectedPlatform || 'all']} · ${state.requiredPeople}명 · 현재 대상 ${result.boats.length}척`);
  const label=mode==='demo'?'예시 자료':mode==='saved'?'이전 자료 열람':noTargets?'조회 대상 없음':outcome?LABELS[outcome]:'조회 전';
  get('query-feedback').dataset.outcome=history?mode:noTargets?'empty':outcome || 'idle';
  const requested=!!current && !['scope','invalid'].includes(issue || '') && !history;
  const countText=requested?`${state.month} ${issue==='offline' || issue==='api'?'요청 전 대상':'마지막 요청 대상'} ${counts.total}척 · 확인 ${counts.success}척 · 실패/미지원 ${counts.failed}척 · ${outcome==='loading'?'대기':'미조회'} ${counts.unqueried}척`:history?'저장 자료의 선박 수는 이번 실시간 확인 수가 아닙니다.':'실시간 요청 전 · 지역·티어를 정한 뒤 조회하기를 누르세요.';
  setText(get('query-result-state'),label);
  setText(get('query-result-counts'),countText);
  let note=history?'현재 잔여석이 아닙니다. 실시간 모드에서 새로 조회하거나 공식 페이지를 확인하세요.':outcome==='loading'?'확인된 선박부터 표시합니다. 아직 응답하지 않은 선박은 미확인입니다.':result.missingBoats.length?`현재 대상 중 ${result.missingBoats.length}척 미확인 · 미조회·실패는 예약 마감이 아닙니다.`:'조회 당시 정보입니다. 최종 잔여석은 공식 페이지에서 확인하세요.';
  if(!history && noTargets) note='선택한 지역·티어에 조회할 선박이 없습니다. 조건을 변경하거나 티어를 등록하세요.';
  else if(!history && issue && current?.message) note=current.message;
  else if(!history && !outcome) note='아직 이 월의 잔여석을 조회하지 않았습니다. 저장된 티어는 유지됩니다.';
  else if(!history && !result.events.length && (outcome==='success' || outcome==='empty')) note='선택 조건에 맞는 일정 없음 · 어종·인원 조건과 미확인 선박을 확인하세요. 예약 마감이라는 뜻은 아닙니다.';
  setText(get('query-result-note'),note);
  const latest=result.latest,age=latest?Date.now()-Date.parse(latest):Infinity;
  const recent=Number.isFinite(age) && age>=-60000 && age<=FRESH_MS;
  setText(get('last-observed'),latest?`관측 ${new Date(latest).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · ${history?'이전 자료':!navigator.onLine?'오프라인 · 새 확인 필요':recent?'조회 당시 정보':'시간 경과 · 새 조회 필요'}`:'관측 시각 · 확인된 자료 없음');
  const filteredEmpty=(outcome==='success' || outcome==='empty') && !result.events.length;
  const recover=!history && (noTargets || filteredEmpty || outcome==='error' || outcome==='partial' || outcome==='cancelled' || outcome==='empty');
  get('query-recovery').hidden=!recover;
  for(const [id,visible] of Object.entries({'recovery-fleet':noTargets,'recovery-region':noTargets || recover,'recovery-tiers':noTargets,'recovery-species':!noTargets && filteredEmpty,'recovery-query':!noTargets && recover,'recovery-api':issue==='api','recovery-official':!noTargets && recover})) get(id).hidden=!visible;
}

export function scrollToControl(target:HTMLElement) {
  target.focus({preventScroll:true});
  target.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
}
export function installQueryRecovery(root:HTMLElement) {
  const routes:Record<string,string>={'recovery-fleet':'#fleet-search','recovery-region':'#region-toggle>summary','recovery-tiers':'#tabs button','recovery-species':'#species-toggle>summary','recovery-query':'#query-submit','recovery-api':'#api-url','recovery-official':'#source-boat'};
  root.addEventListener('click',event=>{
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('#query-recovery a');
    const selector=link && routes[link.id];if(!selector) return;
    const target=root.querySelector<HTMLElement>(selector);if(!target) return;
    event.preventDefault();
    for(let parent:HTMLElement|null=target.parentElement;parent && parent!==root;parent=parent.parentElement) if(parent instanceof HTMLDetailsElement) parent.open=true;
    scrollToControl(target);
  });
}

/** Only user date navigation announces; refreshing the whole detail panel stays silent. */
export function revealSelectedDay(root:HTMLElement,keyboard:boolean) {
  const panel=root.querySelector<HTMLElement>('#day-view')!,heading=panel.querySelector<HTMLElement>('h2')!;
  const narrow=!!window.matchMedia?.('(max-width: 900px)')?.matches;
  const announcement=root.querySelector<HTMLElement>('#day-announcement')!;
  if(narrow && keyboard) {setText(announcement,'');heading.focus({preventScroll:true});}
  else setText(announcement,heading.textContent || '');
  if(narrow) panel.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
}
