import catalog from './data/sunsang24Fleet.json';
import type { Boat } from './models';

export type Platform='thefishing'|'sunsang24'|'external';
export type PlatformFilter='all'|'thefishing'|'sunsang24';
export const PLATFORM_LABELS={all:'전체',thefishing:'더피싱',sunsang24:'선상24',external:'외부 사이트'};
export const SUNSANG24_LIVE_ENABLED=false;
export const SUNSANG24_DISABLED_MESSAGE='선상24 실시간 조회는 현재 연동 이용 허가가 없어 제공되지 않습니다. 공식 페이지에서 잔여석을 확인하세요.';
const byUid=new Map(catalog.boats.map(b=>[b.uid,b]));
const byShip=new Map(catalog.boats.map(b=>[b.shipId,b]));
export function sunsangListing(uid:string) {return byUid.get(uid) || byShip.get(/^sunsang24:ship:(\d+)$/.exec(uid)?.[1] || '');}
export function boatPlatform(boat:Pick<Boat,'uid'>):Platform {
  return sunsangListing(boat.uid) || /^sunsang24:ship:\d+$/.test(boat.uid) ? 'sunsang24':/^\d+$/.test(boat.uid) || boat.uid.startsWith('thefishing-fleet:') ? 'thefishing':'external';
}
export function readPlatform(value:unknown):PlatformFilter {return value==='thefishing' || value==='sunsang24' ? value:'all';}
export function matchesPlatform(boat:Boat,filter?:PlatformFilter):boolean {return !filter || filter==='all' || boatPlatform(boat)===filter;}
export function platformBadge(boat:Pick<Boat,'uid'>):HTMLElement {
  const platform=boatPlatform(boat),node=document.createElement('span');node.className=`platform-tag platform-${platform}`;node.textContent=PLATFORM_LABELS[platform];return node;
}
export function sunsangLink(value:unknown,uid:string):string {
  if(typeof value!=='string') return '';
  const listing=sunsangListing(uid),shipId=listing?.shipId || /^sunsang24:ship:(\d{1,10})$/.exec(uid)?.[1];
  if(!shipId) return '';
  if(listing && value===listing.url) return value;
  try {
    const url=new URL(value);
    if(url.origin!=='https://www.sunsang24.com' || url.username || url.password || url.hash || !['/ship/list','/ship/list/'].includes(url.pathname)) return '';
    if(url.searchParams.getAll('ship_no').length!==1 || url.searchParams.get('ship_no')!==shipId || [...url.searchParams.keys()].some(k=>!['ship_no','sdate'].includes(k))) return '';
    const dates=url.searchParams.getAll('sdate');
    if(dates.length>1 || dates.some(d=>!/^20\d\d-\d\d-\d\d$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10)!==d)) return '';
    return url.href;
  } catch {return '';}
}
export function sunsangDateLink(uid:string,date:string):string {
  const id=sunsangListing(uid)?.shipId || /^sunsang24:ship:(\d+)$/.exec(uid)?.[1];
  return id ? sunsangLink(`https://www.sunsang24.com/ship/list?ship_no=${id}&sdate=${date}`,uid):'';
}
export function departureNote(boat:Boat):string {
  const listing=sunsangListing(boat.uid);
  return listing && !boat.port && listing.departureArea ? `원본 출항 구역 ${listing.departureArea} · 정확한 항구 미확인`:'';
}
/** A possible match is informational only: never merges inventory or seat counts. */
export function duplicateCandidates(boat:Boat,boats:Boat[]):Boat[] {
  if(!boat.port || !boat.region?.province || !boat.region.local) return [];
  const name=(v:string)=>v.normalize('NFKC').replace(/\s/g,'').toLowerCase();
  return boats.filter(b=>b.uid!==boat.uid && boatPlatform(b)!==boatPlatform(boat) && b.port===boat.port && b.region?.province===boat.region?.province && b.region?.local===boat.region?.local && name(b.name)===name(boat.name));
}
