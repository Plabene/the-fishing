// Copy only public boat fields and calendar membership; never copy the state folder.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/sync-fleet.mjs <PC state directory>');
const read = async name => JSON.parse((await readFile(resolve(directory, name), 'utf8')).replace(/^\uFEFF/, ''));
const catalog = await read('boat_catalog.json');
const preferences = await read('monthly_calendar_preferences.json');
const external = await read('external_boat_sites.json');
const operators = await read('thefishing_operator_catalog.json');
const clean = value => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g, '[연락처 제외]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[연락처 제외]').trim();
const tiers = ['tier1', 'tier2', 'tier3', 'other'];
const boats = new Map();
const extraLinks = {};
function add(row, id, extra = false) {
  id = clean(id);
  if (!/^[\p{L}\p{M}\p{N}:_-]{1,160}$/u.test(id)) throw new Error('Unsupported boat identifier');
  const url = new URL(row.reservation_url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Unsafe boat URL');
  if (!extra && (url.hostname !== 'thefishing.kr' || url.pathname !== '/reservation/list.php' || url.search !== `?uid=${id}`)) throw new Error('Unexpected native boat URL');
  if (extra && !['thefishing.kr', 'teamhanpro.com', 'nurifishing.sunsang24.com', 'doublek.sunsang24.com'].includes(url.hostname)) throw new Error('Review new external source before including it');
  if ([...url.searchParams.keys()].some(key => !['uid', 'mid'].includes(key))) throw new Error('Unexpected query fields');
  const region={sea:clean(row.jurisdiction_label).slice(0,60),province:clean(row.province_label).slice(0,60),local:clean(row.local_area_label).slice(0,60)};
  boats.set(id, {uid:id, name:clean(row.boat_name).slice(0,160), port:clean(row.departure_port).slice(0,160), url:url.href,...(Object.values(region).some(Boolean) ? {region}:{})});
  if (extra) extraLinks[id] = url.href;
}
for (const row of Object.values(catalog.entries)) add(row, row.boat_uid);
for (const row of external.entries.filter(row => row.active)) add(row, row.site_id, true);
for (const row of Object.values(operators.fleet_members).filter(row => row.active)) add(row, row.stable_id, true);
const state = {
  schema:1, boats:[...boats.values()],
  tiers:Object.fromEntries(tiers.map(tier => [tier, (preferences.boat_tiers[tier] || []).map(clean)])),
  selectedUids:preferences.selected_boat_uids.map(clean),
  month:`${preferences.selected_year}-${String(preferences.selected_month).padStart(2,'0')}`,
  requiredPeople:preferences.required_people, events:[], failures:[],
};
for (const id of [...state.selectedUids,...Object.values(state.tiers).flat()]) if (!boats.has(id)) throw new Error(`Missing catalog entry for ${id}`);
const version = createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0,16);
const output = resolve(import.meta.dirname, '../src/data');
await mkdir(output, {recursive:true});
await writeFile(resolve(output, 'defaultFleet.json'), JSON.stringify({version, state}, null, 2) + '\n');
await writeFile(resolve(output, 'sourceLinks.json'), JSON.stringify(extraLinks, null, 2) + '\n');
console.log(JSON.stringify({boats:state.boats.length,selected:state.selectedUids.length,tiers:Object.fromEntries(tiers.map(t=>[t,state.tiers[t].length])),extraLinks:Object.keys(extraLinks).length,version}));
