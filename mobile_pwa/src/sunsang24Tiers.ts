import seed from './data/sunsang24Tiers.json';
import catalog from './data/sunsang24Fleet.json';
import {TIERS,type AppState} from './models';

export const SUNSANG_TIER_VERSION=seed.version;
export const SUNSANG_TIER_COUNT=seed.selectedUids.length;
/** One-time inheritance fills unassigned boats only. Explicit restore replaces the 21 PC entries. */
export function applySunsangTiers(current:AppState,overwrite=false):AppState {
  const state=structuredClone(current),existing=new Set(state.boats.map(b=>b.uid));
  const assigned=new Set(TIERS.flatMap(t=>state.tiers[t]));
  const incoming=new Set(seed.selectedUids);
  if(overwrite) {
    for(const b of catalog.boats) if(incoming.has(b.uid) && !existing.has(b.uid)) {
      state.boats.push({uid:b.uid,name:b.name,port:b.port,url:b.url,region:{sea:b.sea,province:b.province,local:b.local}});
      existing.add(b.uid);
    }
    for(const tier of TIERS) state.tiers[tier]=state.tiers[tier].filter(id=>!incoming.has(id));
    state.selectedUids=state.selectedUids.filter(id=>!incoming.has(id));
  }
  const added=new Set<string>();
  for(const tier of TIERS) for(const id of seed.tiers[tier]) if(existing.has(id) && (overwrite || !assigned.has(id))) {
    state.tiers[tier].push(id);added.add(id);
  }
  const selected=new Set(state.selectedUids);
  state.selectedUids.push(...seed.selectedUids.filter(id=>added.has(id) && !selected.has(id)));
  state.sunsangTierVersion=SUNSANG_TIER_VERSION;
  return state;
}
