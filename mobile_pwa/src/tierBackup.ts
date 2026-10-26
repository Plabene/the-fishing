import {TIERS,uid,text,reservationLink,type AppState,type Boat,type Tier} from './models';
import {readRegion} from './regions';
import {sunsangListing} from './platforms';
import {normalizeTiers} from './tierStore';

const FORMAT='thefishing-tier-backup';
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj=>v && typeof v==='object' && !Array.isArray(v) ? v as Obj:{};
export const isTierBackup=(value:unknown)=>object(value).format===FORMAT;
const invalid=()=>new Error('티어 백업 형식이 올바르지 않습니다. 원본 JSON 파일을 선택하세요.');
function identity(value:unknown):string {
  if(typeof value!=='string' || !value || uid(value)!==value) throw invalid();
  return sunsangListing(value)?.uid || value;
}
function cleanBoat(b:Boat):Boat {
  const id=identity(b.uid),region=readRegion(b.region);
  return {uid:id,name:text(b.name) || `UID ${id}`,port:text(b.port),url:reservationLink(b.url,id),...(region ? {region}:{})};
}
/** A portable tier list contains no seats, query history, API settings or device metadata. */
export function exportTierBackup(state:AppState,now=new Date(),scopeUids:readonly string[]=[]):string {
  const byId=new Map(state.boats.map(b=>[b.uid,b]));
  const tiers=normalizeTiers(state.tiers);
  for(const tier of TIERS) tiers[tier]=tiers[tier].filter(id=>byId.has(id));
  const ids=[...new Set([...TIERS.flatMap(t=>tiers[t]),...state.selectedUids.filter(id=>byId.has(id)),...scopeUids.filter(id=>byId.has(id))])];
  return JSON.stringify({format:FORMAT,version:2,createdAt:now.toISOString(),
    boats:ids.map(id=>cleanBoat(byId.get(id)!)),
    tiers:Object.fromEntries(TIERS.map(t=>[t,tiers[t].map(identity)])),
    selectedUids:state.selectedUids.filter(id=>byId.has(id)).map(identity)},null,2);
}
/** Replace the included boats' tiers/selection; preserve other boats and all observations. */
export function restoreTierBackup(value:unknown,current:AppState):{state:AppState;count:number} {
  const root=object(value);
  if(!isTierBackup(root) || (root.version!==1 && root.version!==2) || !Array.isArray(root.boats) || root.boats.length>10000 || !Array.isArray(root.selectedUids)) throw invalid();
  const boats:Boat[]=[],scope=new Set<string>();
  for(const raw of root.boats) {
    const b=object(raw),id=identity(b.uid);
    if(scope.has(id) || typeof b.name!=='string' || !text(b.name) || typeof b.port!=='string' || typeof b.url!=='string') throw invalid();
    scope.add(id);boats.push(cleanBoat(b as unknown as Boat));
  }
  const rawTiers=object(root.tiers),tiers={} as Record<Tier,string[]>,assigned=new Set<string>();
  for(const tier of TIERS) {
    const values=rawTiers[tier];if(!Array.isArray(values) || values.length>10000) throw invalid();
    tiers[tier]=values.map(value=>{const id=identity(value);if(!scope.has(id) || assigned.has(id)) throw invalid();assigned.add(id);return id;});
  }
  if(root.version===1 && assigned.size!==scope.size || root.selectedUids.length>10000) throw invalid();
  const selection=root.selectedUids.map(identity);
  if(new Set(selection).size!==selection.length || selection.some(id=>!scope.has(id))) throw invalid();
  const state=structuredClone(current),existing=new Set(state.boats.map(b=>b.uid));
  if(state.boats.length+boats.filter(b=>!existing.has(b.uid)).length>10000) throw invalid();
  state.boats.push(...boats.filter(b=>!existing.has(b.uid)));
  for(const tier of TIERS) state.tiers[tier]=[...tiers[tier],...state.tiers[tier].filter(id=>!scope.has(id))];
  state.selectedUids=[...selection,...state.selectedUids.filter(id=>!scope.has(id))];
  return {state,count:assigned.size};
}
