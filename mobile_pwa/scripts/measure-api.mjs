// Explicit, bounded live benchmark. Never imported by tests or run by CI.
// pnpm exec node scripts/measure-api.mjs --live --phase=before|after
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
if(!process.argv.includes('--live')) throw new Error('실제 조회를 측정하려면 --live를 명시하세요.');
const phase=process.argv.includes('--phase=before') ? 'before':'after';
const server=await createServer({configFile:false,root:process.cwd(),server:{middlewareMode:true,watch:null}});
try {
  const {TheFishingApi}=await server.ssrLoadModule('/src/providers/thefishingApi.ts');
  const {collectMonth}=await server.ssrLoadModule('/src/liveQuery.ts');
  const origin='https://thefishing-availability.thefishing-mobile-a.workers.dev';
  const boats=['349','431','530','560'].map(uid=>({uid,name:uid,port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`}));
  let requests=0;const request=(input,init)=>{requests++;return fetch(input,{...init,headers:{...init?.headers,Origin:'https://plabene.github.io'}});};
  let client=new TheFishingApi(origin,request);
  const results=[];
  for(const pass of ['first','server-cache',...(phase==='after' ? ['device-cache','next-month']:[])]) {
    if(pass==='server-cache') client=new TheFishingApi(origin,request);
    const month=pass==='next-month' ? '2026-11':'2026-10';
    const start=performance.now(),before=requests;
    const result=await collectMonth(client,boats,month,new AbortController().signal,()=>{},phase==='before' ? 1:3);
    const row={pass,month,ms:Math.round(performance.now()-start),requests:requests-before,stopped:result.stopped,rows:result.rows.map(({boat,result})=>({uid:boat.uid,status:result.status,cached:!!result.cached,observedAt:result.observedAt,events:result.events}))};
    results.push(row);console.log(JSON.stringify({...row,rows:row.rows.map(r=>({...r,events:r.events.length,species:[...new Set(r.events.map(e=>e.species))]}))}));
    if(result.stopped) break;
  }
  const dir=resolve('../.local/species-performance');await mkdir(dir,{recursive:true});
  await writeFile(resolve(dir,`${phase}-client.json`),JSON.stringify({phase,at:new Date().toISOString(),results},null,2));
} finally {await server.close();}
