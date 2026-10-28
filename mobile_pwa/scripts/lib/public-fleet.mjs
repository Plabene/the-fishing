import {parseHTML} from 'linkedom';
const clean=value=>String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200b\ufeff]/g,' ').replace(/\s+/g,' ').trim();
/** Only public vessel identity/navigation; no seats, customers, notices, contacts or accounts are exported. */
export function parsePublicFleet(html,source,observedAt) {
  if(!/^[a-z0-9-]+\.sunsang24\.com$/.test(source.host) || ['www','api','service'].includes(source.host.split('.')[0])) throw new Error('등록된 선사 주소를 확인하세요.');
  const doc=parseHTML(html).document;
  if(!doc.querySelector('.month_nav') || /access denied|captcha/i.test(doc.querySelector('title')?.textContent || '')) throw new Error('공개 예약표 구조를 확인하지 못했습니다.');
  const address=[...doc.querySelectorAll('.col-xs-6')].filter(x=>!x.closest('.small_event,.editor_memo_pc,.editor_memo_mobile')).map(x=>clean(x.textContent)).find(t=>t.includes('오시는길')) || '';
  if(source.locationToken && !address.includes(source.locationToken)) throw new Error('선사 주소가 변경됐습니다. 지역 재확인 필요');
  const ships=new Map(),active=new Set();
  const add=(id,name)=>{if(!/^[1-9]\d{0,9}$/.test(id || '') || !name || name.length>100 || /01[016789][- .]?\d{3,4}[- .]?\d{4}/.test(name)) throw new Error('선박 식별자·이름 형식 변경');const old=ships.get(id);if(old && old!==name) throw new Error('같은 ID의 선박명 충돌');ships.set(id,name);};
  for(const node of doc.querySelectorAll('button.btn-schedule-ship[data-ship-list-no]')) {if(node.closest('.small_event,.editor_memo_pc,.editor_memo_mobile')) continue;const id=node.getAttribute('data-ship-list-no');if(id!=='0') add(id,clean(node.textContent));}
  for(const table of doc.querySelectorAll('table.ship_unit')) {
    if(table.closest('.small_event,.editor_memo_pc,.editor_memo_mobile')) continue;
    const id=/\bship_unit_ship_no_(\d+)\b/.exec(table.className)?.[1],title=table.querySelector('.ship_info .title')?.cloneNode(true);
    title?.querySelectorAll('.vtt').forEach(x=>x.remove());add(id,clean(title?.textContent));active.add(id);
  }
  const hostId=doc.querySelector('input[name="host_ship_no"]')?.getAttribute('value');
  if(ships.size>1 && !active.has(hostId)) ships.delete(hostId);
  for(const id of source.excludeShipIds || []) ships.delete(id);
  if(!ships.size || ships.size>300) throw new Error('확인 가능한 선박 목록이 없습니다. 기존 항목 유지');
  return [...ships].map(([shipId,name])=>{
    const port=source.portByShip?.[shipId] || '';
    // A reviewed per-vessel port must still appear on that vessel's current public card.
    const cards=[...doc.querySelectorAll(`table.ship_unit_ship_no_${shipId}`)];
    const verifiedPort=port && cards.some(t=>[...t.querySelectorAll('.editor_memo_pc')].some(x=>clean(x.textContent).includes(port))) ? port:'';
    return {shipId,uid:`sunsang24:ship:${shipId}`,name,port:verifiedPort,departureArea:'',province:source.province,local:source.local,provinceId:'',areaId:'',sea:source.sea,
      url:`https://www.sunsang24.com/ship/list?ship_no=${shipId}`,observedAt,sourceUrl:`https://${source.host}/ship/schedule_fleet`,regionBasis:source.province?'public-provider-address':'unknown',calendarObserved:active.has(shipId)};
  });
}
export function mergePublicFleet(previous,results) {
  const rows=new Map(previous.map(b=>[b.shipId,{...b}])),conflicts=[],observations=new Map();let changed=0;
  for(const boat of results.flat()) {const group=observations.get(boat.shipId) || [];group.push(boat);observations.set(boat.shipId,group);}
  for(const [id,group] of observations) {
    const boat=group[0];
    if(['name','province','local','sea'].some(field=>new Set(group.map(b=>b[field])).size>1) || new Set(group.map(b=>b.port).filter(Boolean)).size>1) {conflicts.push({shipId:id,field:'conflicting-public-sources'});continue;}
    const old=rows.get(boat.shipId);
    if(old) {
      const sameSource=group.some(b=>b.sourceUrl===old.sourceUrl);
      if(old.name!==boat.name && !sameSource) {conflicts.push({shipId:boat.shipId,field:'name'});continue;}
      // Keep PC region evidence, legacy UID aliases and personal navigation identity intact.
      const verifiedPort=group.find(b=>b.port)?.port;
      const next={...old,name:boat.name,observedAt:boat.observedAt,sourceUrl:sameSource?old.sourceUrl:boat.sourceUrl,calendarObserved:!!(sameSource && old.calendarObserved) || group.filter(b=>b.sourceUrl===(sameSource?old.sourceUrl:boat.sourceUrl)).some(b=>b.calendarObserved),...((!old.province || sameSource && old.regionBasis==='public-provider-address') && boat.province ? {province:boat.province,local:boat.local,sea:boat.sea,regionBasis:boat.regionBasis}:{}),...(verifiedPort && (!old.port || sameSource) ? {port:verifiedPort}:{})};
      if(['name','port','province','local','sea'].some(field=>old[field]!==next[field])) changed++;
      rows.set(boat.shipId,next);
    } else rows.set(boat.shipId,boat);
  }
  return {boats:[...rows.values()].sort((a,b)=>Number(a.shipId)-Number(b.shipId)),conflicts,changed};
}
/** Independently validate a metadata API response before writing a published static catalog. */
export function validatePublicFleet(value,source) {
  if(!value || value.status!=='OK' || value.host!==source.host || !Array.isArray(value.boats) || !value.boats.length || value.boats.length>300) throw new Error('공개 목록 API 형식 오류');
  const time=Date.parse(value.observedAt);
  if(!Number.isFinite(time) || time>Date.now()+60000 || Date.now()-time>86400000) throw new Error('공개 목록 API 확인 시각 오류');
  const seen=new Set();
  return value.boats.map(b=>{
    if(source.excludeShipIds?.includes(b?.shipId)) throw new Error('선박이 아닌 목록 항목이 포함되었습니다.');
    if(!b || !/^[1-9]\d{0,9}$/.test(b.shipId) || seen.has(b.shipId) || b.uid!==`sunsang24:ship:${b.shipId}` || typeof b.name!=='string' || !b.name || b.name.length>100 || typeof b.port!=='string' || b.port.length>100 || b.port && source.portByShip?.[b.shipId]!==b.port || typeof b.calendarObserved!=='boolean' || b.observedAt!==value.observedAt) throw new Error('공개 목록 API 선박 형식 오류');
    if(['sea','province','local'].some(k=>b[k]!==source[k]) || b.url!==`https://www.sunsang24.com/ship/list?ship_no=${b.shipId}` || b.sourceUrl!==`https://${source.host}/ship/schedule_fleet`) throw new Error('공개 목록 API 출처 불일치');
    seen.add(b.shipId);
    return {shipId:b.shipId,uid:b.uid,name:clean(b.name),port:b.port,departureArea:'',province:source.province,local:source.local,provinceId:'',areaId:'',sea:source.sea,url:b.url,observedAt:value.observedAt,sourceUrl:b.sourceUrl,regionBasis:source.province?'public-provider-address':'unknown',calendarObserved:b.calendarObserved};
  });
}
