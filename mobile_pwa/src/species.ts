import { text, type Observation } from './models';

// Keep the PC palette/keys, but classify the original trip instead of old derived labels.
export const UNKNOWN_SPECIES='unknown';
export const MIXED_SPECIES='주꾸미+갑오징어';
const aliases:Record<string,string>={쭈꾸미:'주꾸미',주꾸미:'주꾸미',쭈구미:'주꾸미',알쭈:'주꾸미',갑오징어:'갑오징어',돌문어:'문어',문어:'문어',참돔:'참돔',광어:'광어',우럭:'우럭',갈치:'갈치',한치:'한치',고등어:'고등어',농어:'농어',대구:'대구',열기:'열기',볼락:'볼락',백조기:'백조기',꽃게:'꽃게',무늬오징어:'무늬오징어'};
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
  const found=[...new Set(Object.keys(aliases).filter(alias=>normalized.includes(alias)).map(alias=>aliases[alias]))].sort();
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
  if(Array.isArray(value)) return [...new Set(value.filter(v=>typeof v==='string' && v.trim()).slice(0,200).map(speciesFilterKey).filter((key):key is string=>key!==null))];
  if(typeof value!=='string' || value==='all') return 'all';
  const key=speciesFilterKey(value);return key===null ? 'all':[key];
}
export function speciesLabel(value:unknown):string {
  const key=speciesKey(value);
  return key===UNKNOWN_SPECIES ? '기타/미확인' : key===MIXED_SPECIES ? '쭈꾸미ㆍ갑오징어' : key.replaceAll('+','·');
}
export function eventSpecies(event:Pick<Observation,'trip'|'species'|'speciesKey'>):string {
  // All API/PC species fields are derived from trip. Recompute to repair saved misclassifications.
  if(!placeholder(event.trip)) return speciesKey(event.trip);
  const key=speciesKey(event.speciesKey);
  return key===UNKNOWN_SPECIES ? speciesKey(event.species) : key;
}
export function matchesSpecies(key:string,selected:string|string[]='all'):boolean {
  if(Array.isArray(selected)) return selected.some(wanted=>matchesSpecies(key,wanted));
  if(selected==='all') return true;
  const wanted=speciesFilterKey(selected), actual=speciesKey(key);
  if(wanted===null) return true;
  return actual===wanted || (!wanted.includes('+') && actual.split('+').includes(wanted));
}
// Existing PC palette assignments for the common species; unknown remains gray.
const colors:Record<string,string>={unknown:'#E8E8E8',갑오징어:'#ECDEDD','갑오징어+문어':'#E2F1F1',광어:'#FFE0E6',백조기:'#ECDEDC',우럭:'#D9E6E2',주꾸미:'#E5D7D3',[MIXED_SPECIES]:'#F0E3FF','광어+우럭':'#E2F4DC',문어:'#DCEEFF',참돔:'#E6D8DB',열기:'#DADBEB',농어:'#E8DCE9'};
export function speciesColor(value:string):string {
  const key=speciesKey(value);if(colors[key]) return colors[key];
  let hash=0;for(const char of key) hash=(hash*31+char.charCodeAt(0))>>>0;
  return `hsl(${hash%360} 35% 90%)`;
}
export function speciesBadge(event:Observation):HTMLSpanElement {
  const key=eventSpecies(event),node=document.createElement('span');
  node.className='species-badge';node.textContent=`어종 · ${speciesLabel(key)}`;node.style.backgroundColor=speciesColor(key);return node;
}
