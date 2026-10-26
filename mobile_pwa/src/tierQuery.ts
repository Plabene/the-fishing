import {TIERS,type AppState,type Filter} from './models';
import {orderedBoats,matchesTier,tierFor} from './tierStore';
import {matchesPlatform} from './platforms';
import {matchesRegion} from './regions';

/** Query membership comes from explicit tier assignments. Legacy selections stay in backups. */
export function tierQueryState(state:AppState):AppState {
  const known=new Set(state.boats.map(boat=>boat.uid));
  return {...state,selectedUids:[...new Set(TIERS.flatMap(tier=>state.tiers[tier]))].filter(id=>known.has(id))};
}
export function tierQueryBoats(state:AppState,filter:Filter) {
  const registered=new Set(tierQueryState(state).selectedUids);
  return orderedBoats(state).filter(boat=>registered.has(boat.uid) && matchesTier(tierFor(state,boat.uid),filter) && matchesPlatform(boat,state.selectedPlatform) && matchesRegion(boat,state.selectedRegion));
}
