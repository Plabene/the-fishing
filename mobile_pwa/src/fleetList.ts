import type {Boat} from './models';
import {boatPlatform,sunsangListing,type PlatformFilter} from './platforms';
import {publicRouteForBoat} from './sunsang24PublicRoutes';
import {officialDetail} from './models';
import type {LiveRow} from './liveQuery';
import {bookingAlias} from './bookingAliases';

const korean=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
export function boatIdentity(boat:Boat):string {
  const platform=boatPlatform(boat);
  return `${platform}:${platform==='sunsang24'?sunsangListing(boat.uid)?.shipId || boat.uid:boat.uid}`;
}
/** Exact platform identifiers only; same names on different platforms remain separate. */
export function uniqueFleet(boats:Boat[]):Boat[] {
  const seen=new Set<string>();return boats.filter(boat=>{const id=boatIdentity(boat);if(seen.has(id)) return false;seen.add(id);return true;});
}
export function alphabeticFleet(boats:Boat[]):Boat[] {
  return uniqueFleet(boats).sort((a,b)=>korean.compare(a.name.normalize('NFKC').trim(),b.name.normalize('NFKC').trim()) || korean.compare(boatPlatform(a),boatPlatform(b)) || korean.compare(a.uid,b.uid));
}
export function platformCounts(boats:Boat[]):Record<PlatformFilter,number> {
  const unique=uniqueFleet(boats);return {all:unique.length,thefishing:unique.filter(b=>boatPlatform(b)==='thefishing').length,sunsang24:unique.filter(b=>boatPlatform(b)==='sunsang24').length};
}
export function supportsLive(boat:Boat):boolean {return !!bookingAlias(boat.uid) || (boatPlatform(boat)==='sunsang24'?!!publicRouteForBoat(boat.uid):!!officialDetail(boat.url,boat.uid));}
export function platformQueryStats(boats:Boat[],rows:LiveRow[]) {
  const byId=new Map(rows.map(row=>[boatIdentity(row.boat),row.result]));
  return (['thefishing','sunsang24','external'] as const).map(platform=>{
    const candidates=uniqueFleet(boats).filter(b=>boatPlatform(b)===platform);
    let success=0,unlinked=0,restricted=0,failed=0,pending=0,events=0;
    for(const boat of candidates) {
      const result=byId.get(boatIdentity(boat));
      if(!result) pending++;
      else if(result.status==='ALLOWED_READABLE') {success++;events+=result.events.length;}
      else if(result.status==='UNSUPPORTED_SOURCE') unlinked++;
      else if(['PERMISSION_DENIED','ACCESS_RESTRICTED','AUTH_OR_COOKIE_BLOCKED'].includes(result.status)) restricted++;
      else failed++;
    }
    return {platform,total:candidates.length,success,unlinked,restricted,failed,pending,events};
  }).filter(row=>row.total>0);
}
