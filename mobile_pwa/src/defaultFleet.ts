import seed from './data/defaultFleet.json';
import { importData } from './importLegacy';
import { TIERS, type AppState } from './models';

export const FLEET_VERSION = seed.version;
export function defaultFleet(): AppState {
  return {...importData(seed.state).state, fleetSeedVersion:FLEET_VERSION};
}
export function initializeFleet(saved: unknown): {state:AppState; seeded:boolean; changed:boolean} {
  if (!saved) return {state:defaultFleet(), seeded:true, changed:true};
  const state = importData(saved).state;
  if (!state.fleetSeedVersion && !state.boats.length && !state.events.length && !state.failures.length)
    return {state:defaultFleet(), seeded:true, changed:true};
  const changed = !state.fleetSeedVersion;
  if (changed) state.fleetSeedVersion = FLEET_VERSION;
  return {state, seeded:false, changed};
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
  return state;
}
