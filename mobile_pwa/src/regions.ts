import {text,type Boat} from './models';
import {boatPlatform,departureNote} from './platforms';
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
const provinces:Record<string,string>={충남:'충청남도',전남:'전라남도',경기:'경기도',경남:'경상남도',경북:'경상북도',전북:'전북특별자치도',전라북도:'전북특별자치도',강원:'강원특별자치도',강원도:'강원특별자치도',인천:'인천광역시',부산:'부산광역시',울산:'울산광역시',제주:'제주특별자치도',제주도:'제주특별자치도'};
const locals:Record<string,string[]>={충청남도:['보령','서천','태안','서산','당진','홍성'],경기도:['화성','시흥','안산','평택'],전라남도:['여수','고흥','강진','완도','목포','진도','해남','장흥'],경상남도:['사천','통영','거제'],전북특별자치도:['군산','부안'],인천광역시:['옹진']};
export function commonRegion(boat:Boat):BoatRegion {
  const raw=boat.region,province=provinces[raw?.province || ''] || raw?.province || '';
  const region={sea:raw?.sea || '',province,local:raw?.local || ''};
  region.local=(locals[province] || []).find(k=>[k,k+'시',k+'군'].includes(region.local)) || region.local;
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
export function matchesRegion(boat:Boat,filter?:Partial<RegionFilter>):boolean {return REGION_FIELDS.every(key=>!filter?.[key] || regionValue(boat,key)===filter[key]);}
export function regionLabel(boat:Boat):string {return Object.values(commonRegion(boat)).filter(Boolean).join(' · ') || '지역 미확인';}
export function locationDescription(boat:Boat):string {
  const canonical=regionLabel(boat),raw=Object.values(boat.region || {}).filter(Boolean).join(' · ');
  return [departureNote(boat),raw && raw!==canonical ? `원본 등록 지역 ${raw}`:''].filter(Boolean).join(' · ');
}
/** Translate old saved filters by the actual matching vessels, never by ambiguous label alone. */
export function migrateRegionFilter(boats:Boat[],filter?:RegionFilter):RegionFilter|undefined {
  if(!filter || boats.some(b=>matchesRegion(b,filter))) return filter;
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
