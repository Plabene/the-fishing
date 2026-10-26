import seed from './data/publishedPreferences.json';
import {TIERS,type AppState} from './models';
export const PUBLISHED_PREFERENCES_VERSION=seed.version;
export const PUBLISHED_PREFERENCES_COUNTS={tier1:seed.tiers.tier1.length,tier2:seed.tiers.tier2.length,tier3:seed.tiers.tier3.length,other:seed.tiers.other.length};
export function applyPublishedPreferences(current:AppState,explicit=false):AppState {
  if(current.publishedPreferencesVersion===seed.version) return current;
  const state=structuredClone(current),scope=new Set(seed.boatUids),existing=new Set(state.boats.map(b=>b.uid));
  // Existing device preferences always win. Replacement is only for a new install or an explicit restore.
  if(!explicit) {state.publishedPreferencesVersion=seed.version;return state;}
  for(const tier of TIERS) state.tiers[tier]=[...seed.tiers[tier].filter(id=>existing.has(id)),...state.tiers[tier].filter(id=>!scope.has(id))];
  state.selectedUids=[...seed.selectedUids.filter(id=>existing.has(id)),...state.selectedUids.filter(id=>!scope.has(id))];
  state.publishedPreferencesVersion=seed.version;return state;
}
