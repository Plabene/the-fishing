import supplied from './data/tierRecovery.json';
import previousSupplied from './data/previousTierRecovery.json';
import {TIERS,type AppState,type Boat} from './models';
import type {PreferenceSnapshot} from './preferenceProtection';
import {restoreTierBackup} from './tierBackup';
export const RECOVERY_VERSION=supplied.version;
export const RECOVERY_DATE=supplied.createdAt.slice(0,10);
export const suppliedPreferences:PreferenceSnapshot=supplied;
export function recoveryPreview(state:AppState,backup:PreferenceSnapshot) {
  const assignments=new Map(TIERS.flatMap(t=>state.tiers[t].map(id=>[id,t] as const))),known=new Set([...state.boats,...backup.boats || []].map(b=>b.uid));
  let missing=0,conflicts=0,unresolved=0;
  for(const tier of TIERS) for(const id of backup.tiers[tier]) {
    if(!known.has(id)) unresolved++;
    else if(!assignments.has(id)) missing++;
    else if(assignments.get(id)!==tier) conflicts++;
  }
  return {missing,conflicts,unresolved,total:TIERS.reduce((n,t)=>n+backup.tiers[t].length,0),selected:backup.selectedUids.length};
}
/** Recovery uses recorded IDs and names, never name-only matching or invented tiers. */
export function recoverPreferences(current:AppState,backup:PreferenceSnapshot,mode:'missing'|'exact') {
  const known=new Map<string,Boat>([...(backup.boats || []),...current.boats].map(b=>[b.uid,b]));
  const assigned=new Set(TIERS.flatMap(t=>current.tiers[t]));
  const scope=new Set([...TIERS.flatMap(t=>backup.tiers[t]),...backup.selectedUids].filter(id=>known.has(id) && (mode==='exact' || !assigned.has(id))));
  const file={format:'thefishing-tier-backup',version:2,boats:[...scope].map(id=>known.get(id)!),tiers:Object.fromEntries(TIERS.map(t=>[t,backup.tiers[t].filter(id=>scope.has(id))])),selectedUids:backup.selectedUids.filter(id=>scope.has(id))};
  const result=restoreTierBackup(file,current);
  // Filling gaps must not clear any current selection, including currently unassigned boats.
  if(mode==='missing') result.state.selectedUids=[...new Set([...current.selectedUids,...result.state.selectedUids])];
  return {...result,unresolved:recoveryPreview(current,backup).unresolved};
}
export function initializePreferenceRecovery(current:AppState,existingDevice:boolean):{state:AppState;restored:number} {
  if(current.preferenceRecoveryVersion===RECOVERY_VERSION) return {state:current,restored:0};
  // Only recover a known full catalog automatically; respect custom catalogs and intentionally deleted boats.
  const known=new Set(current.boats.map(b=>b.uid)),matchesBackup=TIERS.flatMap(t=>suppliedPreferences.tiers[t]).every(id=>known.has(id));
  const unchangedPrevious=current.preferenceRecoveryVersion===previousSupplied.version && TIERS.every(t=>JSON.stringify(current.tiers[t])===JSON.stringify(previousSupplied.tiers[t])) && JSON.stringify(current.selectedUids)===JSON.stringify(previousSupplied.selectedUids);
  // Only upgrade an exactly unchanged older backup. Any later personal edit needs explicit recovery.
  const empty=TIERS.every(t=>!current.tiers[t].length) && !current.preferenceRecoveryVersion;
  const result=existingDevice && matchesBackup && (empty || unchangedPrevious)?recoverPreferences(current,suppliedPreferences,unchangedPrevious?'exact':'missing'):{state:structuredClone(current),count:0};
  result.state.preferenceRecoveryVersion=RECOVERY_VERSION;
  return {state:result.state,restored:result.count};
}
