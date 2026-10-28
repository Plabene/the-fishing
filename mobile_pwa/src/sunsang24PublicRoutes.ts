import data from './data/sunsang24PublicRoutes.json';
import catalog from './data/sunsang24Fleet.json';
import sources from './data/sunsang24CatalogSources.json';
import {sunsangListing} from './platforms';

// Only IDs observed in public calendar cards are mapped. Never infer from names.
export const SUNSANG_PUBLIC_ROUTES=new Map(data.routes.map(route=>[route.host,{...route,ships:[...route.ships]}]));
const reviewedHosts=new Set(sources.sources.map(s=>s.host));
// Weekly identity refresh must also refresh the booking connection. Never infer a host from a name.
for(const boat of catalog.boats) {
  if(!('sourceUrl' in boat) || !('calendarObserved' in boat) || boat.calendarObserved!==true || !boat.sourceUrl) continue;
  const match=/^https:\/\/([a-z0-9-]+\.sunsang24\.com)\/ship\/schedule_fleet$/.exec(boat.sourceUrl);
  if(!match || !reviewedHosts.has(match[1]) || !/^[1-9]\d{0,9}$/.test(boat.shipId)) continue;
  // Keep an already verified canonical host when the same fleet appears on sibling homepages.
  if([...SUNSANG_PUBLIC_ROUTES.values()].some(r=>r.ships.includes(boat.shipId))) continue;
  const host=match[1],route=SUNSANG_PUBLIC_ROUTES.get(host) || {host,ships:[],evidenceUrl:boat.sourceUrl,verifiedAt:boat.observedAt};
  route.ships.push(boat.shipId);SUNSANG_PUBLIC_ROUTES.set(host,route);
}
export function reviewedPublicHost(host:string):boolean {return reviewedHosts.has(host) || SUNSANG_PUBLIC_ROUTES.has(host);}
/** Older clients validate their bundled IDs strictly and do not send the reviewed host parameter. */
export function legacyPublicShipIds(host:string):string[] {return data.routes.find(r=>r.host===host)?.ships || [];}
const byShip=new Map([...SUNSANG_PUBLIC_ROUTES.values()].flatMap(route=>route.ships.map(id=>[id,route] as const)));
export const SUNSANG_PUBLIC_SHIP_COUNT=byShip.size;
export function publicRouteForShip(shipId:string) {return byShip.get(shipId);}
export function publicRouteForBoat(uid:string) {return publicRouteForShip(sunsangListing(uid)?.shipId || '');}
export const SUNSANG_PUBLIC_UNMAPPED='이 선박의 공개 월 예약표 주소와 선박 ID가 아직 확인되지 않았습니다. 공식 예약 페이지에서 확인하세요.';
