import { dateOnly, officialDetail, text, type Boat, type Observation } from '../models';
import { speciesKey, speciesLabel } from '../species';

const paths=new Set(['/reservation/list.view.view.1.ajax.php','/reservation/list.view.view.1.ajax.new.php']);
export function calendarEndpoint(value:string):string {
  const u=new URL(value);
  if(u.origin!=='https://thefishing.kr' || u.username || u.password || u.port || u.search || u.hash || !paths.has(u.pathname)) throw new Error('허용된 월 달력 주소가 아닙니다.');
  return u.href;
}
export function discoverCalendar(html:string,boat:Boat) {
  if(!officialDetail(boat.url,boat.uid)) throw new Error('지원하지 않는 선박 상세 주소입니다.');
  const data=html.match(/date6\s*=\s*['"]?\+?date6[\s\S]*?st_uid=(\d+)&(?:amp;)?pa_uid=(\d+)/i);
  const urls=[...html.matchAll(/url\s*:\s*['"]([^'"]*list\.view\.view\.1\.ajax[^'"]*)['"]/gi)].map(m=>m[1]);
  if(!data || data[2]!==boat.uid || !urls.length) throw new Error('상세 페이지에서 선박과 일치하는 월 달력 정보를 찾지 못했습니다.');
  const endpoints=[...new Set(urls.map(url=>calendarEndpoint(new URL(url,boat.url).href)))];
  if(endpoints.length!==1) throw new Error('월 달력 주소가 여러 개여서 확정할 수 없습니다.');
  return {endpoint:endpoints[0],st_uid:data[1],pa_uid:data[2]};
}
function inert(html:string, dom:Document):DocumentFragment {
  // Detached template content never executes scripts or loads embedded resources.
  const template=dom.createElement('template'); template.innerHTML=html;
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta,img,svg').forEach(n=>n.remove());
  return template.content;
}
const clean=(v:string|null)=>text(v || '',2000).replace(/\s+/g,' ').trim();
export function securityDocument(html:string, dom:Document=globalThis.document):boolean {
  const fragment=inert(html,dom);
  const content=[...fragment.childNodes].map(node=>node.textContent || '').join(' ');
  return /비정상\s*(?:적인\s*)?접근|접근이\s*차단|access denied|captcha|robot verification|kuipernet|카이퍼넷/i.test(content);
}
function remaining(value:string):number|null {
  const patterns=[/남은\s*(?:인원|자리)\s*[:：]?\s*(\d+)/,/잔여\s*(?:인원|좌석|자리)?\s*[:：]?\s*(\d+)\s*(?:석|명|자리)?/,/(\d+)\s*명\s*(?:예약\s*)?가능/,/예약\s*가능\s*(?:인원)?\s*[:：]?\s*(\d+)/];
  for(const p of patterns) { const m=value.match(p); if(m) {const n=Number(m[1]);return n<=10000 ? n : null;} }
  return null;
}
function departure(value:string):string {
  const m=value.match(/(?:출항시간|출항|출발)\s*[:：]?\s*(?:(오전|오후)\s*)?(\d{1,2})\s*[:시]\s*(\d{1,2})?\s*분?/);
  if(!m) return ''; let h=Number(m[2]), minute=Number(m[3] || 0);
  if(m[1]==='오후' && h<12) h+=12; if(m[1]==='오전' && h===12) h=0;
  return h<24 && minute<60 ? `${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')}` : '';
}
async function identity(value:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
export async function parseCalendar(html:string,boat:Boat,month:string,observedAt:string,dom:Document=globalThis.document):Promise<Observation[]> {
  const doc=inert(html,dom), compact=month.replace('-','');
  const markers=[...doc.querySelectorAll('.re_mon .on,[data-month]')].map(n=>`${n.getAttribute('onclick') || ''} ${n.getAttribute('data-month') || ''}`);
  if(markers.length && !markers.some(v=>v.includes(compact) || v.includes(month))) throw new Error('응답의 월이 요청한 월과 다릅니다.');
  let monthEvidence=markers.some(v=>v.includes(compact) || v.includes(month));
  const candidates=new Map<string,{date:string;action:string;scope:Element}>();
  let datedActions=0;
  for(const anchor of doc.querySelectorAll('a')) {
    const onclick=anchor.getAttribute('onclick') || '', href=anchor.getAttribute('href') || '';
    const candidate=onclick.match(/t_popup\(\s*['"]([^'"]+)['"]/i)?.[1] || href;
    let url:URL; try {url=new URL(candidate,boat.url);} catch {continue;}
    if(url.origin!=='https://thefishing.kr' || url.username || url.password || !/^\/member\/popup(?:\.new)?\.php$/.test(url.pathname)) continue;
    const d=url.searchParams.get('date'); if(!d || !/^20\d{6}$/.test(d)) continue;
    const scope=anchor.closest('.re_status') || anchor.closest('td'); if(!scope) continue;
    datedActions++;
    if(url.searchParams.get('PA_N_UID')!==boat.uid) throw new Error('달력 상품의 선박 UID가 요청과 다릅니다.');
    const date=dateOnly(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`); if(!date || !date.startsWith(month+'-')) continue;
    monthEvidence=true;
    const key=`${date}:${url.href}`,previous=candidates.get(key);
    if(!previous || scope.querySelectorAll('.schedule2 li').length>previous.scope.querySelectorAll('.schedule2 li').length) candidates.set(key,{date,action:url.href,scope});
  }
  if(!monthEvidence || (datedActions>0 && !candidates.size) || !doc.querySelector('table,.re_status,.dayline')) throw new Error('요청한 월의 달력 응답인지 확인할 수 없습니다.');
  const events:Observation[]=[], seen=new Set<string>();
  for(const {date,action,scope} of candidates.values()) {
    const value=clean(scope.textContent);
    if(/예약완료|예약불가|마감|출조취소|운항취소|대기하기/.test(value)) continue;
    const seats=remaining(value), options=[...scope.querySelectorAll('.schedule2 li')];
    for(const option of options.length ? options : [scope]) {
      const optionText=clean(option.textContent), clone=option.cloneNode(true) as Element;
      const amounts=[...new Set([...optionText.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)\s*원|\d{1,3}(?:,\d{3})+/g)].map(m=>Number(m[0].replace(/[^0-9]/g,''))).filter(n=>n<=100000000))];
      const price=amounts.length===1 ? amounts[0] : null;
      // PC parser retains product link text; removing all anchors can erase the trip name.
      clone.querySelectorAll('.fc_g,.ico_d,.price,[class*="price"],.re_btn2,.schedule').forEach(n=>n.remove());
      if(!options.length) clone.querySelectorAll('a,p').forEach(n=>n.remove());
      const trip=text(clean(clone.textContent).replace(/(?:대인|소인|대|소)?\s*\d{1,3}(?:,\d{3})+\s*원?/g,'').replace(/남은\s*인원\s*\d+\s*명/g,'')) || '기본 출조';
      const time=departure(optionText)||departure(value), key=JSON.stringify([boat.uid,date,action,trip,price,time]);
      if(seen.has(key)) continue; seen.add(key);
      events.push({id:`direct-${await identity(key)}`,uid:boat.uid,date,trip,speciesKey:speciesKey(trip),species:speciesLabel(trip),port:boat.port,departure:time,remaining:seats,price,verified:true,observedAt,source:'direct'});
    }
  }
  return events;
}
