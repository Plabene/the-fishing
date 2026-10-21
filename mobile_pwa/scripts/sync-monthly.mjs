// Export public monthly availability observations; never copy raw PC state.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.argv[2]) throw new Error('Usage: node scripts/sync-monthly.mjs <PC state directory>');
const cache = JSON.parse((await readFile(resolve(process.argv[2], 'monthly_availability_cache.json'), 'utf8')).replace(/^\uFEFF/, ''));
const fleet = JSON.parse(await readFile(resolve(import.meta.dirname, '../src/data/defaultFleet.json'), 'utf8'));
const known = new Set(fleet.state.boats.map(b=>b.uid));
const clean = (value, max=160) => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g,'[연락처 제외]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[연락처 제외]').trim().slice(0,max);
const timestamp = value => typeof value === 'string' && /^20\d\d-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value)<=Date.now()+60_000 ? value : null;
const observations = new Map(), checks = new Map();
// A wider (smaller people threshold) query covers the narrower cached queries.
// Pick one complete snapshot per boat/month so query variants cannot duplicate products.
const preferred = new Map();
for (const entry of Object.values(cache.entries || {})) {
  const r=entry.result || {}, q=r.query || {};
  if (r.stale || r.partial || r.cancelled || !timestamp(r.completed_at)) continue;
  const people=Number(q.required_people); if (!Number.isInteger(people) || people<1 || people>100) continue;
  for (const uid of q.boat_uids || []) {
    if ((r.boat_failures || []).some(f=>String(f.boat_uid)===String(uid))) continue;
    const key=`${uid}:${q.year}-${String(q.month).padStart(2,'0')}`, old=preferred.get(key);
    if (!old || people<old.result.query.required_people || (people===old.result.query.required_people && Date.parse(r.completed_at)>Date.parse(old.result.completed_at))) preferred.set(key,entry);
  }
}
let rawEvents=0;
for (const entry of Object.values(cache.entries || {})) {
  const result=entry.result || {}, query=result.query || {};
  const month=`${query.year}-${String(query.month).padStart(2,'0')}`, observedAt=timestamp(result.completed_at);
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month) || !observedAt) continue;
  const people=Number(query.required_people);
  if (!Number.isInteger(people) || people<1 || people>100) continue;
  const failed = new Set((result.boat_failures || []).map(f=>String(f.boat_uid)));
  for (const value of query.boat_uids || []) {
    const uid=String(value); if (!known.has(uid) || preferred.get(`${uid}:${month}`)!==entry) continue;
    const key=`${uid}:${month}:${people}`, check={uid,month,requiredPeople:people,observedAt};
    if (!checks.has(key) || Date.parse(checks.get(key).observedAt)<Date.parse(observedAt)) checks.set(key,check);
  }
  for (const event of result.events || []) {
    rawEvents++;
    const uid=String(event.boat_uid), date=clean(event.date), id=clean(event.event_id,200);
    if (!known.has(uid) || preferred.get(`${uid}:${month}`)!==entry || !/^20\d\d-\d\d-\d\d$/.test(date) || !date.startsWith(month+'-') || !id) continue;
    const instant=new Date(date+'T00:00:00Z'); if (!Number.isFinite(+instant) || instant.toISOString().slice(0,10)!==date) continue;
    const remaining=Number.isInteger(event.remaining_seats) && event.remaining_seats>=0 && event.remaining_seats<=10000 ? event.remaining_seats : null;
    const price=Number.isInteger(event.price_won) && event.price_won>=0 && event.price_won<=100000000 ? event.price_won : null;
    const row={id,uid,date,trip:clean(event.trip_name),port:clean(event.departure_port),departure:clean(event.departure_time),species:clean(event.species_label),price,remaining,verified:event.verified===true && !result.stale && !failed.has(uid),observedAt,source:'imported'};
    const key=`${uid}:${date}:${id}`;
    if (!observations.has(key) || Date.parse(observations.get(key).observedAt)<=Date.parse(observedAt)) observations.set(key,row);
  }
}
const events=[...observations.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.uid.localeCompare(b.uid)||a.id.localeCompare(b.id));
const monthChecks=[...checks.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.uid.localeCompare(b.uid)||a.requiredPeople-b.requiredPeople);
const payload={events,monthChecks};
const version=createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,16);
await writeFile(resolve(import.meta.dirname,'../src/data/monthlyArchive.json'),JSON.stringify({version,...payload},null,2)+'\n');
console.log(JSON.stringify({version,rawEvents,uniqueEvents:events.length,boats:new Set(events.map(e=>e.uid)).size,months:[...new Set(events.map(e=>e.date.slice(0,7)))],latest:events.map(e=>e.observedAt).sort().at(-1)}));
