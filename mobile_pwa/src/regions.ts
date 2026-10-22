import {text,type Boat} from './models';
export interface BoatRegion {sea:string;province:string;local:string}
export interface RegionFilter extends BoatRegion {port:string}
export const UNKNOWN_REGION='__unknown__';
export const REGION_FIELDS=['sea','province','local','port'] as const;
export const REGION_LABELS={sea:'권역',province:'시·도/지역',local:'세부 지역',port:'출항지'};
export const emptyRegion=():RegionFilter=>({sea:'',province:'',local:'',port:''});
export function readRegion(value:unknown):BoatRegion|undefined {
  if(!value || typeof value!=='object') return;
  const row=value as Record<string,unknown>,region={sea:text(row.sea,60),province:text(row.province,60),local:text(row.local,60)};
  return Object.values(region).some(Boolean) ? region:undefined;
}
export function readRegionFilter(value:unknown):RegionFilter {
  const row=value && typeof value==='object' ? value as Record<string,unknown>:{};
  return Object.fromEntries(REGION_FIELDS.map(key=>[key,text(row[key],160)])) as unknown as RegionFilter;
}
export function regionValue(boat:Boat,key:keyof RegionFilter):string {return (key==='port' ? boat.port:boat.region?.[key]) || UNKNOWN_REGION;}
export function matchesRegion(boat:Boat,filter?:Partial<RegionFilter>):boolean {return REGION_FIELDS.every(key=>!filter?.[key] || regionValue(boat,key)===filter[key]);}
export function regionLabel(boat:Boat):string {return [boat.region?.sea,boat.region?.province,boat.region?.local].filter(Boolean).join(' · ') || '지역 미확인';}
export function regionSummary(filter?:Partial<RegionFilter>):string {return REGION_FIELDS.map(key=>filter?.[key]===UNKNOWN_REGION ? `${REGION_LABELS[key]} 미확인`:filter?.[key]).filter(Boolean).join(' · ') || '전체 지역';}
