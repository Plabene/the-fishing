// Explicit import of public PC tide predictions only; no credential/config fields are copied.
import { readFile,writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const path=process.argv[2];if(!path) throw new Error('Provide the PC boryeong_tide_cache.json path');
const server=await createServer({configFile:false,root:process.cwd(),server:{middlewareMode:true,watch:null}});
try {
  const {mergeTideDays}=await server.ssrLoadModule('/src/tides.ts');
  const input=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
  const days=mergeTideDays(Object.values(input.entries || {}).map(d=>({date:d.date,stationCode:d.station_code,fetchedAt:d.fetched_at,extrema:(d.extrema || []).map(e=>({timestamp:e.timestamp,levelCm:e.level_cm,kind:e.kind}))})));
  await writeFile('src/data/tideArchive.json',JSON.stringify({stationCode:'DT_0025',days}));
  console.log(JSON.stringify({days:days.length,months:[...new Set(days.map(d=>d.date.slice(0,7)))]}));
} finally {await server.close();}
