import type {AppState,Boat,Filter} from './models';
import {commonRegion,regionValues} from './regions';
import {tierQueryBoats} from './tierQuery';
import {uniqueFleet} from './fleetList';
import {TIDE_STATIONS,SEA_TIDE_STATIONS,PROVINCE_TIDE_STATIONS,type TideStationCode} from './tideStations';
import {calculateTideMonth} from './tides';

function regionPoint(boat:Boat,depth:string) {
  const r=commonRegion(boat),sea=r.province==='제주특별자치도'?'제주권':r.sea;
  // Exact administrative identity; names alone never determine a station in another province.
  let station:TideStationCode|null=SEA_TIDE_STATIONS[sea] || null;
  if(depth!=='sea') {
    station=PROVINCE_TIDE_STATIONS[r.province] || station;
    if(r.province==='전라남도') station=sea==='서해권'?'DT_0007':sea==='남해권'?'DT_0016':null;
    if(['local','port'].includes(depth) && r.province==='제주특별자치도' && r.local==='서귀포') station='DT_0010';
  }
  const parts=depth==='sea'?[sea]:depth==='province'?[sea,r.province]:depth==='local'?[sea,r.province,r.local]:[sea,r.province,r.local,boat.port];
  return {key:JSON.stringify(parts),label:parts.filter(Boolean).join(' · ')||'지역 미확인',sea,station};
}
/** Same membership as reservation queries: registered tiers, selected regions/platform.
 * Trips, seats, species and successful response order cannot change a vessel's vote. */
export function representativeTide(state:AppState,filter:Filter=state.selectedTiers || 'all') {
  const depth=['port','local','province','sea'].find(k=>regionValues(state.selectedRegion?.[k as keyof NonNullable<AppState['selectedRegion']>]).length)||'sea';
  const boats=uniqueFleet(tierQueryBoats(state,filter)),groups=new Map<string,ReturnType<typeof regionPoint>&{count:number}>();
  for(const boat of boats) {const point=regionPoint(boat,depth),group=groups.get(point.key)||{...point,count:0};group.count++;groups.set(point.key,group);}
  // A stable key resolves ties, so filter order/network completion never changes the point.
  const ranked=[...groups.values()].sort((a,b)=>b.count-a.count || (a.key<b.key?-1:a.key>b.key?1:0));
  const chosen=ranked[0],station=chosen?.station || null;
  return {stationCode:station,station:station?TIDE_STATIONS[station]:null,regionLabel:chosen?.label || '조회 대상 없음',boatCount:chosen?.count || 0,totalBoats:boats.length,
    tied:!!chosen && ranked.filter(g=>g.count===chosen.count).length>1,groups:ranked,
    reason:!chosen?'선택한 지역·티어에 조회 대상 선박이 없습니다.':!station?'대표 지역의 검증된 물때 기준 지점이 없습니다.':'조회 대상 선박 수가 가장 많은 지역 기준'};
}
export function regionalTideMonth(state:AppState,filter:Filter=state.selectedTiers || 'all') {
  const representative=representativeTide(state,filter);
  return {...calculateTideMonth(state.month,state.tideDays || [],representative.stationCode),representative};
}
