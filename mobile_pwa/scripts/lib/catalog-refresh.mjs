import {createHash} from 'node:crypto';
import {mergePublicFleet} from './public-fleet.mjs';

/** A failed refresh publishes diagnostics only; old identity metadata remains byte-for-byte intact. */
export function prepareCatalogRefresh(previous,results,reports,previousSync,now) {
  const merged=mergePublicFleet(previous.boats,results),observed=new Set(results.flat().map(b=>b.shipId)),conflicted=new Set(merged.conflicts.map(c=>c.shipId));
  const verified=new Set([...observed].filter(id=>!conflicted.has(id))),retained=merged.boats.filter(b=>!verified.has(b.shipId)).length;
  const report={status:!results.length?'FAILED':reports.some(r=>r.status!=='OK') || merged.conflicts.length?'PARTIAL':'OK',lastAttemptAt:now,lastSuccessAt:results.length?now:previousSync.lastSuccessAt,total:merged.boats.length,added:merged.boats.length-previous.boats.length,changed:merged.changed,rawItems:results.flat().length,observedUnique:observed.size,verifiedUnique:verified.size,retained,missingShipIds:previous.boats.filter(b=>!verified.has(b.shipId)).map(b=>b.shipId),failedSources:reports.filter(r=>r.status!=='OK').length,conflicts:merged.conflicts.length,schedule:previousSync.schedule,complete:false};
  const next=results.length?{...previous,source:'PC catalog plus verified public provider directories; no seat data',boats:merged.boats,version:createHash('sha256').update(JSON.stringify(merged.boats)).digest('hex').slice(0,16),catalog:{checkedAt:now,coverage:'registered-public-providers-only',complete:false,listed:verified.size,retained,conflicts:merged.conflicts,sources:reports}}:null;
  return {next,report};
}
