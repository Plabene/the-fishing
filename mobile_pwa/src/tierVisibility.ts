import {TIERS,type AppState,type Filter,type Tier} from './models';
import {matchesTier} from './tierStore';
import {matchesPlatform} from './platforms';
import {matchesRegion} from './regions';

/** Count saved assignments independently of query filters and unassigned selected boats. */
export function tierVisibility(state:AppState,filter:Filter) {
  const boats=new Map(state.boats.map(b=>[b.uid,b])),selected=new Set(state.selectedUids),seen=new Set<string>();
  const counts={tier1:0,tier2:0,tier3:0,other:0} as Record<Tier,number>;
  let included=0,unselected=0,excludedTier=0,excludedLocation=0,missingBoat=0;
  for(const tier of TIERS) for(const id of state.tiers[tier]) {
    if(seen.has(id)) continue;seen.add(id);counts[tier]++;
    const boat=boats.get(id);
    if(!boat) missingBoat++;
    else if(!selected.has(id)) unselected++;
    else if(!matchesTier(tier,filter)) excludedTier++;
    else if(!matchesPlatform(boat,state.selectedPlatform) || !matchesRegion(boat,state.selectedRegion)) excludedLocation++;
    else included++;
  }
  const unassignedSelected=[...selected].filter(id=>boats.has(id) && !seen.has(id)).length;
  return {total:seen.size,counts,included,unselected,excludedTier,excludedLocation,missingBoat,unassignedSelected};
}
