import { text, type Observation } from './models';

// Ported from the PC program's species_palette.py. Keep explicit mixed trips together.
export const UNKNOWN_SPECIES='unknown';
export const MIXED_SPECIES='주꾸미+갑오징어';
const aliases:Record<string,string>={쭈꾸미:'주꾸미',주꾸미:'주꾸미',갑오징어:'갑오징어',돌문어:'문어',문어:'문어',참돔:'참돔',광어:'광어',우럭:'우럭',갈치:'갈치',한치:'한치',고등어:'고등어',농어:'농어',대구:'대구',열기:'열기',볼락:'볼락'};
export function speciesKey(value:unknown):string {
  const raw=text(value,160).toLowerCase();
  const compact=raw.replace(/[\s·ㆍᆞ/\\+|,_\-]+/g,'');
  if(['쭈갑','주갑','쭈꾸미갑오징어','주꾸미갑오징어','갑오징어쭈꾸미','갑오징어주꾸미'].includes(compact)) return MIXED_SPECIES;
  const normalized=raw.replace(/[\s·ㆍᆞ,()/|_\-]+/g,'').replace(/(?:낚시|출조|예약|종류|어종)$/,'').replace(/[^0-9a-z가-힣]+/g,' ').trim();
  if(!normalized || ['기본','기본출조','기타','미확인','unknown','기타미확인','미확인기타'].includes(normalized.replace(/ /g,''))) return UNKNOWN_SPECIES;
  const found=[...new Set(Object.keys(aliases).filter(alias=>normalized.includes(alias)).map(alias=>aliases[alias]))].sort();
  if(found.length===2 && found.includes('주꾸미') && found.includes('갑오징어')) return MIXED_SPECIES;
  return found.length ? found.join('+') : normalized.slice(0,80);
}
export function speciesLabel(value:unknown):string {
  const key=speciesKey(value);
  return key===UNKNOWN_SPECIES ? '기타/미확인' : key===MIXED_SPECIES ? '쭈꾸미ㆍ갑오징어' : key.replaceAll('+','·');
}
export function eventSpecies(event:Pick<Observation,'trip'|'species'|'speciesKey'>):string {
  const key=speciesKey(event.speciesKey || event.species);
  return key===UNKNOWN_SPECIES ? speciesKey(event.trip) : key;
}
export function matchesSpecies(key:string,selected='all'):boolean {
  if(selected==='all') return true;
  const wanted=speciesKey(selected), actual=speciesKey(key);
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
