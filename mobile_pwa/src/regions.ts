import {text,type Boat} from './models';
import {boatPlatform,departureNote} from './platforms';
import {normalizeProvince,normalizeLocal} from './regionNames';
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
  const result=Object.fromEntries(REGION_FIELDS.map(key=>[key,text(row[key],160)])) as unknown as RegionFilter;
  result.province=normalizeProvince(result.province);result.local=normalizeLocal(result.local);return result;
}
export function commonRegion(boat:Boat):BoatRegion {
  const raw=boat.region,province=normalizeProvince(raw?.province || '');
  const region={sea:raw?.sea || '',province,local:raw?.local || ''};
  region.local=normalizeLocal(region.local);
  if(boatPlatform(boat)==='thefishing') {
    // The source's 경기 > 인천 category also contains Oido in Siheung.
    if(province==='경기도' && raw?.local==='인천') {
      if(boat.port==='오이도') region.local='시흥';
      else if(['인천남항','연안부두','만석부두','인천','거잠포'].includes(boat.port)) {region.province='인천광역시';region.local='';}
      else {region.province='';region.local='인천권(출항지 미확인)';}
    }
    if(province==='경기도' && raw?.local==='영흥도' && ['영흥도 진두항','영흥도'].includes(boat.port)) {region.province='인천광역시';region.local='옹진';}
    else if(province==='경기도' && raw?.local==='영흥도') {region.province='';region.local='영흥도(출항지 미확인)';}
    if(province==='충청남도' && raw?.local==='안면도') region.local='태안';
    if(province==='전북특별자치도' && raw?.local==='격포') region.local='부안';
  }
  if(['충청남도','경기도','인천광역시','전북특별자치도'].includes(region.province)) region.sea='서해권';
  if(region.province==='경상남도') region.sea='남해권';
  if(region.province==='전라남도') {
    if(['목포','진도','해남'].includes(region.local)) region.sea='서해권';
    if(['여수','고흥','강진','완도','장흥'].includes(region.local)) region.sea='남해권';
  }
  return region;
}
export function regionValue(boat:Boat,key:keyof RegionFilter):string {return (key==='port' ? boat.port:commonRegion(boat)[key]) || UNKNOWN_REGION;}
export function matchesRegion(boat:Boat,filter?:Partial<RegionFilter>):boolean {const normalized=readRegionFilter(filter);return REGION_FIELDS.every(key=>!normalized[key] || regionValue(boat,key)===normalized[key]);}
export function regionLabel(boat:Boat):string {return Object.values(commonRegion(boat)).filter(Boolean).join(' · ') || '지역 미확인';}
export function locationDescription(boat:Boat):string {
  const canonical=regionLabel(boat),raw=Object.values(boat.region || {}).filter(Boolean).join(' · ');
  return [departureNote(boat),raw && raw!==canonical ? `원본 등록 지역 ${raw}`:''].filter(Boolean).join(' · ');
}
/** Translate old saved filters by the actual matching vessels, never by ambiguous label alone. */
export function migrateRegionFilter(boats:Boat[],filter?:RegionFilter):RegionFilter|undefined {
  if(!filter) return filter;
  const normalized=readRegionFilter(filter);
  if(boats.some(b=>matchesRegion(b,normalized))) return normalized;
  const old=boats.filter(b=>REGION_FIELDS.every(k=>!filter[k] || ((k==='port' ? b.port:b.region?.[k]) || UNKNOWN_REGION)===filter[k]));
  if(!old.length) return filter;
  const next={...filter};let reset=false;
  for(const k of REGION_FIELDS) {
    if(reset) {next[k]='';continue;} if(!filter[k]) continue;
    const values=new Set(old.map(b=>regionValue(b,k)));
    if(values.size===1) next[k]=[...values][0];else {next[k]='';reset=true;}
  }
  return next;
}
export function regionSummary(filter?:Partial<RegionFilter>):string {return REGION_FIELDS.map(key=>filter?.[key]===UNKNOWN_REGION ? `${REGION_LABELS[key]} 미확인`:filter?.[key]).filter(Boolean).join(' · ') || '전체 지역';}
