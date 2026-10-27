import { TIDE_SOURCE_URL,TIDE_TTL,qualityLabels,type TideMonth,type CalculatedTide } from './tides';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text:string,cls='') {const el=document.createElement(tag);el.textContent=text;el.className=cls;return el;}
const flow=(day?:CalculatedTide)=>day?.flowPercent==null ? '물흐름 —':`물흐름 ${day.flowPercent}%`;
const range=(day?:CalculatedTide)=>day ? `고저차 ${Math.round(day.rangeCm)}cm`:'고저차 —';
export function addTideToCell(cell:HTMLButtonElement,date:string,month:TideMonth) {
  const day=month.days[date];cell.dataset.tideGrade=day?.grade || 'insufficient';
  const values=node('span','','calendar-tide'),compact=node('span',day?.flowPercent==null?'물 —':`물 ${day.flowPercent}%`,'calendar-tide-compact');compact.setAttribute('aria-hidden','true');values.append(node('span',flow(day)),node('span',range(day)),compact);cell.append(values);
  cell.setAttribute('aria-label',`${cell.getAttribute('aria-label')} · 보령 ${flow(day)} · ${range(day)}`);
}
export function renderTideSummary(target:HTMLElement,month:TideMonth) {
  target.replaceChildren();const days=Object.values(month.days),old=days.some(d=>Date.now()-Date.parse(d.fetchedAt)>TIDE_TTL);
  target.append(node('strong',`보령 물때 · ${days.length}/${month.expectedDays}일`));
  const dates=days.map(d=>d.fetchedAt).sort(),latest=dates.at(-1);
  target.append(node('p',days.length ? `${old ? '이전 저장 자료':'저장 자료'}${latest ? ' · 최근 수집 '+new Date(latest).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):''}${!month.complete ? ' · 일부 날짜 없음':''}${month.missingBoundaryDates.length ? ' · 경계일 자료 부족':''}`:'이 월의 물때 자료가 없습니다. 물때 새로고침을 눌러주세요.','muted'));
  const legend=node('div','','tide-legend');legend.append(node('span','금색 0~29%','tide-gold'),node('span','은색 30~60%','tide-silver'),node('span','일반 61~100%'));target.append(legend);
  target.append(node('p','모든 날짜는 보령 관측소 기준입니다. 물흐름 %는 PC 프로그램과 같은 월별 상대 조차 계산값이며 실제 유속이나 다른 항구의 물때가 아닙니다. 날짜를 누르면 고조·저조 시각을 볼 수 있습니다.','muted'));
  const link=node('a','출처: 국립해양조사원 조석예보 ↗');link.href=TIDE_SOURCE_URL;link.target='_blank';link.rel='noopener noreferrer';target.append(link);
}
export function renderDayTide(target:HTMLElement,date:string,month:TideMonth) {
  const box=node('section','','day-tide'),day=month.days[date];box.setAttribute('aria-label','보령 물때 상세');box.dataset.tideGrade=day?.grade || 'insufficient';
  box.append(node('h3','보령 물때'),node('p',`${flow(day)} · ${range(day)}`));
  if(day) {
    for(const kind of ['high','low'] as const) box.append(node('p',`${kind==='high' ? '고조':'저조'}: ${day.extrema.filter(e=>e.kind===kind).map(e=>`${e.timestamp.slice(11,16)} (${e.levelCm}cm)`).join(' · ')}`));
    box.append(node('p',`${qualityLabels[day.quality]} · 월 기준 ${month.referenceMinCm ?? '—'}~${month.referenceMaxCm ?? '—'}cm${day.flowPercent===null ? ' · 물흐름 계산 자료 부족':''}`,'muted'));
    box.append(node('p',`수집 ${new Date(day.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 고조·저조 시각은 한국 시간`,'muted'));
  } else box.append(node('p','이 날짜의 물때 자료가 없습니다.','muted'));
  target.append(box);
}
