// Bounded manual benchmark. Never loaded by the app or tests.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.argv.includes('--live')) throw new Error('Use --live to measure four public vessels.');
const phase=process.argv.includes('--before') ? 'before':'after';
const server=await createServer({configFile:false,root:process.cwd(),server:{middlewareMode:true,watch:null}});
try {
  const {TheFishingApi}=await server.ssrLoadModule('/src/providers/thefishingApi.ts');
  const {collectMonth}=await server.ssrLoadModule('/src/liveQuery.ts');
  const boats=['349','431','530','560'].map(uid=>({uid,name:uid,port:'',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`}));
  const origin='https://thefishing-availability.thefishing-mobile-a.workers.dev',month='2026-10';
  const values=new Map(),store={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>{values.set(key,structuredClone(value));}};
  let requests=0;
  const request=(input,init)=>{requests++;return fetch(input,{...init,headers:{...init?.headers,Origin:'https://plabene.github.io'}});};
  const results=[];
  for(const pass of ['first','server-cache','reload-cache']) {
    const client=new TheFishingApi(origin,request,pass==='first' ? undefined:store);
    const start=performance.now(),requestCount=requests;let firstMs;
    const result=await collectMonth(client,boats,month,new AbortController().signal,()=>{firstMs??=Math.round(performance.now()-start);},3);
    const row={pass,totalMs:Math.round(performance.now()-start),firstResponseMs:firstMs,requests:requests-requestCount,stopped:result.stopped,rows:result.rows.map(({boat,result})=>({uid:boat.uid,status:result.status,cached:result.cached,observedAt:result.observedAt,events:result.events}))};
    results.push(row);console.log(JSON.stringify({...row,rows:row.rows.map(r=>({...r,events:r.events.length}))}));
    if(result.stopped) break;
  }
  await mkdir('../.local/query-latency',{recursive:true});
  await writeFile(`../.local/query-latency/${phase}.json`,JSON.stringify({phase,at:new Date().toISOString(),month,results},null,2));
} finally {await server.close();}
