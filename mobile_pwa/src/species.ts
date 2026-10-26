import { text, type Observation } from './models';

// Keep the PC palette/keys, but classify the original trip instead of old derived labels.
export const UNKNOWN_SPECIES='unknown';
export const MIXED_SPECIES='주꾸미+갑오징어';
// Fish labels from the PC's saved Sunsang24 filter schema (2026-08-11).
// Non-species categories (기타, 탐사, 시즌어종, etc.) are deliberately not fish aliases.
const names='문어 농어 광어 우럭 갈치 주꾸미 갑오징어 참돔 고등어 무늬오징어 한치 오징어 낙지 호래기 화살촉오징어 참우럭 부시리 삼치 열기 노래미 볼락 벤자리 전갱이 민어 백조기 수조기 도다리 대구 어구가자미 참가자미 붉바리 방어 돌돔 붕장어 쥐치 옥돔 쏨뱅이 망둥어 참치 뿔돔 황열기 홍감펭 임연수어 감성돔 벵에돔 상어 꽃게 홍어'.split(' ');
const aliases:Record<string,string>={...Object.fromEntries(names.map(name=>[name,name])),쭈꾸미:'주꾸미',쭈구미:'주꾸미',알쭈:'주꾸미',돌문어:'문어'};
// Consume the longest name first: 갑오징어 is not also 오징어; 참우럭 is not also 우럭.
const aliasPattern=new RegExp(Object.keys(aliases).sort((a,b)=>b.length-a.length).join('|'),'g');
const fishIn=(value:string)=>[...value.matchAll(aliasPattern)].map(match=>aliases[match[0]]);
const uncertain=/(?:미정|미확정|미확인|미표시|unknown|기타|잡어|시즌어종|어종변경|변경가능|혼합어종|외\d*(?:종|어종)|(?:외|등)(?:출조|낚시)?$)/;
// Recognize an explicitly method/meal/time-only list segment, never an unknown fish name.
const descriptionOnly=/^(?:(?:낚시|출조|외수질|다운샷|지깅|타이라바|텐빈|전투|중식(?:미제공|제공)?|모든미끼포함|생새우(?:미끼)?(?:포함)?|미끼포함|병행)|[\d\s:()원시분명이상*★☆▶◀♡~.!-])+$/;
const separators='[\\s·ㆍᆞ/\\\\+|,._&-]*';
const ju='(?:쭈꾸미|주꾸미|쭈구미|쭈)',gap='(?:갑\\s*오징어|갑이|갑)';
const suffix='(?=$|[^가-힣]|낚시|출조|전투|전문|중식|병행|이벤트|탐사|시즌)';
const mixedAlias=new RegExp(`(?:${ju}${separators}${gap}|${gap}${separators}${ju})${suffix}`,'g');
const shortCuttlefish=new RegExp(`갑이${suffix}`,'g');
const placeholder=(value:unknown)=>['','기본','기본출조','출조','기타','미확인','unknown','기타미확인','미확인기타'].includes(text(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,''));
export function speciesKey(value:unknown):string {
  const raw=text(value,160).toLowerCase();
  // Bare 주 is only a whole-label alias: "매주 갑오징어" does not mean a mixed trip.
  if(['주갑','갑주'].includes(raw.replace(/[\s·ㆍᆞ/\\+|,._&-]+/g,''))) return MIXED_SPECIES;
  // Expand paired abbreviations before removing separators: 쭈/갑, 쭈.갑오징어, 갑쭈.
  const normalized=raw.replace(mixedAlias,'주꾸미+갑오징어').replace(shortCuttlefish,'갑오징어').replace(/\s+/g,'');
  if(uncertain.test(normalized)) return UNKNOWN_SPECIES;
  const parts=normalized.split(/[,;/\\+|&·ㆍᆞ]+/).filter(Boolean);
  // Never discard an unrecognized target in an enumerated list to create a false single-species trip.
  if(parts.length>1 && parts.some(part=>!fishIn(part).length && !descriptionOnly.test(part))) return UNKNOWN_SPECIES;
  const found=[...new Set(fishIn(normalized))].sort();
  if(found.length===2 && found.includes('주꾸미') && found.includes('갑오징어')) return MIXED_SPECIES;
  // A method, bait, region or notice alone is not evidence of a target species.
  return found.length ? found.join('+') : UNKNOWN_SPECIES;
}
/** Drop obsolete free-text filter keys rather than merging them into all unknown trips. */
export function speciesFilterKey(value:unknown):string|null {
  const key=speciesKey(value);
  return key!==UNKNOWN_SPECIES || placeholder(value) ? key:null;
}
export function normalizeSpeciesSelection(value:unknown):'all'|string[] {
  if(Array.isArray(value)) return [...new Set(value.filter(v=>typeof v==='string' && v.trim()).slice(0,200).map(speciesFilterKey).filter((key):key is string=>key!==null).flatMap(key=>key.split('+')))];
  if(typeof value!=='string' || value==='all') return 'all';
  const key=speciesFilterKey(value);return key===null ? 'all':key.split('+');
}
export function speciesLabel(value:unknown):string {
  const key=speciesKey(value);
  return key===UNKNOWN_SPECIES ? '기타/미확인' : key===MIXED_SPECIES ? '쭈꾸미ㆍ갑오징어' : key.replaceAll('+','·');
}
export function eventSpecies(event:Pick<Observation,'trip'|'species'|'speciesKey'>):string {
  // API/PC labels are derived from trip. Missing/unclear raw evidence must not borrow a stale label.
  return speciesKey(event.trip);
}
export function matchesSpecies(key:string,selected:string|string[]='all'):boolean {
  const selection=normalizeSpeciesSelection(selected);
  if(selection==='all') return true;
  const actual=speciesKey(key).split('+');
  return actual.length===selection.length && actual.every(token=>selection.includes(token));
}
// Existing PC palette assignments for the common species; unknown remains gray.
const colors:Record<string,string>={unknown:'#E8E8E8',갑오징어:'#ECDEDD','갑오징어+문어':'#E2F1F1',광어:'#FFE0E6',백조기:'#ECDEDC',우럭:'#D9E6E2',주꾸미:'#E5D7D3',[MIXED_SPECIES]:'#F0E3FF','광어+우럭':'#E2F4DC',문어:'#DCEEFF',참돔:'#E6D8DB',열기:'#DADBEB',농어:'#E8DCE9'};
export function speciesColor(value:string):string {
  const key=speciesKey(value);if(colors[key]) return colors[key];
  let hash=0;for(const char of key) hash=(hash*31+char.charCodeAt(0))>>>0;
  return `hsl(${hash%360} 35% 90%)`;
}
export function displayedSpecies(event:Pick<Observation,'trip'|'species'|'speciesKey'>):string {
  return eventSpecies(event);
}
/** The result label and the original trip always describe the entire source trip. */
export function tripDescription(event:Observation):HTMLElement {
  const node=document.createElement('p');node.textContent=event.trip || '출조명 미표시';return node;
}
export function speciesBadge(event:Observation):HTMLSpanElement {
  const key=displayedSpecies(event),node=document.createElement('span');
  node.className='species-badge';node.textContent=`어종 · ${speciesLabel(key)}`;node.style.backgroundColor=speciesColor(key);return node;
}
