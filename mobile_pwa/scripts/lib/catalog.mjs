import {parseHTML} from 'linkedom';
export const CATALOG_URL='https://thefishing.kr/reservation/list.php';
const clean=value=>String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g,'[연락처 제외]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[연락처 제외]').trim();
export function parseCatalogPage(html,page=1) {
  const doc=parseHTML(html).document;
  if(/access denied|captcha|cloudflare ray id|접근이 차단|비정상적인 접근/i.test(doc.querySelector('title')?.textContent || '') || doc.querySelector('form[action*="challenge"]')) throw new Error('카탈로그 접근 제한');
  const counts=doc.querySelector('.re_s_total')?.textContent || '',total=Number(counts.match(/검색\s*([\d,]+)\s*건/)?.[1]?.replaceAll(',',''));
  if(!Number.isInteger(total) || total<1 || total>5000) throw new Error('전체 목록 건수를 확인하지 못했습니다.');
  const section=doc.querySelector('.re_st_2')?.closest('article');
  if(!section || !section.querySelector('.re_st_2')?.textContent?.includes('예약')) throw new Error('예약 목록 영역이 없습니다.');
  const pageTitle=doc.querySelector('title')?.textContent?.match(/(\d+)페이지/);
  if(pageTitle && Number(pageTitle[1])!==page) throw new Error('응답 페이지 번호가 요청과 다릅니다.');
  const cards=[...section.querySelectorAll('.re_list > ul > li')],boats=[];
  if(!cards.length || cards.length>100) throw new Error('선박 목록이 비어 있거나 형식이 달라졌습니다.');
  for(const card of cards) {
    const link=card.querySelector('a[href]'),url=new URL(link?.getAttribute('href') || '',CATALOG_URL),uid=url.searchParams.get('uid');
    if(url.origin!=='https://thefishing.kr' || url.pathname!=='/reservation/list.php' || !/^\d{1,10}$/.test(uid || '') || url.search!==`?uid=${uid}` || url.hash || url.username || url.password) throw new Error('목록에 잘못된 상세 URL이 있습니다.');
    const name=clean(card.querySelector('.re_list_ship')?.textContent).slice(0,160);
    const path=clean(card.querySelector('.re_list_area')?.textContent).split(/\s*>\s*/).filter(Boolean);
    if(path.length>4) throw new Error('지역 경로 형식이 달라졌습니다.');
    const region={sea:(path[0] || '').slice(0,60),province:(path[1] || '').slice(0,60),local:(path[2] || '').slice(0,60)};
    boats.push({uid,name,port:(path[3] || '').slice(0,160),url:url.href,...(path.length ? {region}:{})});
  }
  if(boats.every(b=>!b.name)) throw new Error('목록 이름 필드가 누락됐습니다.');
  const last=section.querySelector('a.next10[href]'),lastPage=last ? Number(new URL(last.getAttribute('href'),CATALOG_URL).searchParams.get('page')):1;
  if(!Number.isInteger(lastPage) || lastPage<page || lastPage>100) throw new Error('마지막 페이지를 확인하지 못했습니다.');
  return {total,lastPage,boats};
}
export async function collectCatalog(readPage,onProgress=()=>{}) {
  return collectCatalogPages(async page=>parseCatalogPage(await readPage(page),page),onProgress);
}
export function validateCatalogPage(value,page) {
  if(!value || !Number.isInteger(value.total) || value.total<1 || value.total>5000 || !Number.isInteger(value.lastPage) || value.lastPage<page || value.lastPage>100 || !Array.isArray(value.boats) || !value.boats.length || value.boats.length>100) throw new Error('목록 API 응답 형식 오류');
  const boats=value.boats.map(b=>{
    if(!b || typeof b.uid!=='string' || !/^\d{1,10}$/.test(b.uid) || b.url!==`${CATALOG_URL}?uid=${b.uid}` || typeof b.name!=='string' || b.name.length>160 || typeof b.port!=='string' || b.port.length>160) throw new Error('목록 API 선박 정보 오류');
    let region;
    if(b.region) {
      if(['sea','province','local'].some(k=>typeof b.region[k]!=='string' || b.region[k].length>60)) throw new Error('목록 API 지역 정보 오류');
      region=Object.fromEntries(['sea','province','local'].map(k=>[k,clean(b.region[k])]));
    }
    return {uid:b.uid,name:clean(b.name),port:clean(b.port),url:b.url,...(region ? {region}:{})};
  });
  return {total:value.total,lastPage:value.lastPage,boats};
}
export async function collectCatalogPages(readPage,onProgress=()=>{}) {
  const first=validateCatalogPage(await readPage(1),1),boats=[...first.boats];
  if(Math.ceil(first.total/first.boats.length)!==first.lastPage) throw new Error('전체 건수와 페이지 수가 맞지 않습니다.');
  onProgress(1,first.lastPage);
  for(let page=2;page<=first.lastPage;page++) {
    const result=validateCatalogPage(await readPage(page),page);
    if(result.total!==first.total || result.lastPage!==first.lastPage || (page<first.lastPage && result.boats.length!==first.boats.length)) throw new Error('수집 중 목록 건수 또는 페이지가 변경됐습니다. 기존 목록을 유지합니다.');
    boats.push(...result.boats);onProgress(page,first.lastPage);
  }
  if(boats.length!==first.total) throw new Error(`목록 건수 불일치: 표시 ${first.total}, 수집 ${boats.length}`);
  const groups=new Map();
  for(const boat of boats) {const group=groups.get(boat.uid)||[];group.push(boat);groups.set(boat.uid,group);}
  let conflicts=0;
  const unique=[...groups.values()].map(group=>{
    let conflict=false;
    const agreed=key=>{const values=[...new Set(group.map(b=>key==='region' ? (b.region ? JSON.stringify(b.region):''):b[key]).filter(Boolean))];if(values.length>1) conflict=true;return values.length===1 ? values[0]:'';};
    const name=agreed('name'),regionText=agreed('region'),port=agreed('port');
    if(conflict) conflicts++;
    // Never choose an arbitrary winner for inconsistent cards. Missing fields retain prior verified metadata.
    return {uid:group[0].uid,name,port:regionText ? port:'',url:group[0].url,...(regionText ? {region:JSON.parse(regionText)}:{})};
  });
  // Public pages repeat cards and can reorder between requests. This verifies page coverage, not unique coverage.
  return {boats:unique,pages:first.lastPage,total:unique.length,listedCards:first.total,duplicates:boats.length-unique.length,conflicts};
}
export function mergePublishedFleet(previous,incoming) {
  const rows=new Map(previous.map(b=>[b.uid,{...b}]));
  for(const boat of incoming) {
    const old=rows.get(boat.uid);
    // Listings sometimes omit a known harbor; preserve it only when the region still agrees.
    const region=boat.region || old?.region;
    const sameRegion=old && JSON.stringify(old.region)===JSON.stringify(region);
    rows.set(boat.uid,{...boat,name:boat.name || old?.name || `UID ${boat.uid} · 이름 미확인`,port:boat.port || (sameRegion ? old.port:''),...(region ? {region}:{})});
  }
  return [...rows.values()].sort((a,b)=>a.uid.localeCompare(b.uid,'en',{numeric:true}));
}
