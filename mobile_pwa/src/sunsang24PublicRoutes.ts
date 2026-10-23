import data from './data/sunsang24PublicRoutes.json';
import {sunsangListing} from './platforms';

// Only IDs observed in public calendar cards are mapped. Never infer from names.
export const SUNSANG_PUBLIC_ROUTES=new Map(data.routes.map(route=>[route.host,route]));
const byShip=new Map(data.routes.flatMap(route=>route.ships.map(id=>[id,route] as const)));
export const SUNSANG_PUBLIC_SHIP_COUNT=byShip.size;
export function publicRouteForShip(shipId:string) {return byShip.get(shipId);}
export function publicRouteForBoat(uid:string) {return publicRouteForShip(sunsangListing(uid)?.shipId || '');}
export const SUNSANG_PUBLIC_UNMAPPED='이 선박의 공개 월 예약표 주소와 선박 ID가 아직 확인되지 않았습니다. 공식 예약 페이지에서 확인하세요.';
