import seed from './data/defaultFleet.json';
import legacy from './data/legacyFleet.json';
import sunsang from './data/sunsang24Fleet.json';
import {migrateRegionFilter} from './regions';
import { importData } from './importLegacy';
import { TIERS, type AppState,type Boat } from './models';
import {applySunsangTiers,SUNSANG_TIER_VERSION} from './sunsang24Tiers';

export const FLEET_VERSION = seed.version.slice(0,8)+sunsang.version.slice(0,8);
export function defaultFleet(): AppState {
  const state=importData(seed.state).state;
  const existing=new Set(state.boats.map(b=>b.uid));
  state.boats.push(...sunsang.boats.filter(b=>!existing.has(b.uid)).map(b=>({uid:b.uid,name:b.name,port:b.port,url:b.url,region:{sea:b.sea,province:b.province,local:b.local}})));
  return applySunsangTiers({...state,fleetSeedVersion:FLEET_VERSION,fleetBaseline:structuredClone(state.boats)});
}
export function mergeFleetCatalog(current:AppState,boats:Boat[],version:string,baseline:Boat[]):AppState {
  const state=structuredClone(current),previous=new Map(baseline.map(b=>[b.uid,b])),incoming=new Map(boats.map(b=>[b.uid,b]));
  const existing=new Set(state.boats.map(b=>b.uid));
  for(const boat of state.boats) {
    const next=incoming.get(boat.uid),old=previous.get(boat.uid);if(!next) continue;
    const originalPort=boat.port;
    if(old) for(const field of ['name','port','url'] as const) if(boat[field]===old[field]) boat[field]=next[field];
    if(old ? JSON.stringify(boat.region)===JSON.stringify(old.region) && originalPort===old.port : !boat.region && originalPort===next.port) {
      if(next.region) boat.region=structuredClone(next.region);else delete boat.region;
    }
  }
  // Newly discovered boats start unselected. Missing catalog entries never erase personal boats.
  for(const boat of boats) if(!existing.has(boat.uid) && !previous.has(boat.uid)) state.boats.push(structuredClone(boat));
  state.fleetBaseline=structuredClone(boats);state.fleetSeedVersion=version;return state;
}
export function initializeFleet(saved: unknown): {state:AppState; seeded:boolean; changed:boolean} {
  if (!saved) return {state:defaultFleet(), seeded:true, changed:true};
  let state = importData(saved).state;
  if (!state.fleetSeedVersion && !state.boats.length && !state.events.length && !state.failures.length)
    return {state:defaultFleet(), seeded:true, changed:true};
  const catalogChanged=state.fleetSeedVersion!==FLEET_VERSION || !state.fleetBaseline;
  const tiersChanged=state.sunsangTierVersion!==SUNSANG_TIER_VERSION;
  if(catalogChanged) {
    const defaults=defaultFleet();
    const baseline=state.fleetBaseline || (state.fleetSeedVersion===legacy.version ? legacy.boats:defaults.boats);
    state=mergeFleetCatalog(state,defaults.boats,FLEET_VERSION,baseline);
    if(state.selectedRegion) state.selectedRegion=migrateRegionFilter(state.boats,state.selectedRegion);
  }
  if(tiersChanged) state=applySunsangTiers(state);
  return {state, seeded:false, changed:catalogChanged || tiersChanged};
}
/** Explicit restore replaces the PC fleet's order while retaining custom boats and observations. */
export function applyDefaultFleet(current: AppState): AppState {
  const defaults = defaultFleet(), state = structuredClone(current);
  const known = new Set(defaults.boats.map(boat=>boat.uid));
  const extra = new Set(state.boats.filter(boat=>!known.has(boat.uid)).map(boat=>boat.uid));
  state.boats = [...defaults.boats,...state.boats.filter(boat=>extra.has(boat.uid))];
  for (const tier of TIERS) state.tiers[tier] = [...defaults.tiers[tier],...state.tiers[tier].filter(id=>extra.has(id))];
  state.selectedUids = [...defaults.selectedUids,...state.selectedUids.filter(id=>extra.has(id))];
  state.requiredPeople = defaults.requiredPeople;
  state.fleetSeedVersion = FLEET_VERSION;
  state.fleetBaseline=structuredClone(defaults.boats);
  state.sunsangTierVersion=SUNSANG_TIER_VERSION;
  return state;
}
