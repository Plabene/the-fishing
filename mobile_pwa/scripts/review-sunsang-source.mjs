// Inspect a user/public-link supplied homepage without enrolling it or modifying tiers.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {publicCandidateHost,discoverPublicHosts} from './lib/public-discovery.mjs';
import {parsePublicFleet} from './lib/public-fleet.mjs';
const args=process.argv.slice(2),host=args.find(a=>a.startsWith('--host='))?.slice(7);
if(!args.includes('--live') || !host || publicCandidateHost(`https://${host}/`)!==host) throw new Error('Use --live --host=<verified candidate>.sunsang24.com');
const month=args.find(a=>a.startsWith('--month='))?.slice(8)||new Date(Date.now()+9*3600000).toISOString().slice(0,7);
if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
const server=await createServer({root:resolve(import.meta.dirname,'..'),server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
 const {Sunsang24PublicService,PUBLIC_CATALOG_SOURCES}=await server.ssrLoadModule('/availability_api/sunsang24Public.ts');
 const {SUNSANG_PUBLIC_ROUTES}=await server.ssrLoadModule('/src/sunsang24PublicRoutes.ts');
 const source=PUBLIC_CATALOG_SOURCES.get(host)||{host,province:'',local:'',sea:'',locationToken:'',portByShip:{}};
 // This inspection-only registration lives in this process; production host allowlist is unchanged.
 SUNSANG_PUBLIC_ROUTES.set(host,{host,ships:[]});
 let last=0,html='';const request=async(...params)=>{
  await new Promise(r=>setTimeout(r,Math.max(0,last+1000-Date.now())));last=Date.now();
  const response=await fetch(...params);
  if(String(params[0]).includes('/ship/schedule_fleet/') && response.ok) {
   const reader=response.clone().body.getReader(),parts=[];let size=0;
   for(;;) {const part=await reader.read();if(part.done) break;size+=part.value.length;if(size>12000000) {await reader.cancel();throw new Error('Response too large');}parts.push(part.value);}
   html=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
   const boats=parsePublicFleet(html,source,new Date().toISOString());
   SUNSANG_PUBLIC_ROUTES.set(host,{host,ships:boats.filter(b=>b.calendarObserved).map(b=>b.shipId)});
  }
  return response;
 };
 const data=new Map(),service=new Sunsang24PublicService({get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);}},request);
 const result=await service.query('1',month,host);
 const report={checkedAt:new Date().toISOString(),host,month,status:result.status,message:result.message,sourceUrl:`https://${host}/ship/schedule_fleet/${month.replace('-','')}`,addressVerification:source.province?'PREVIOUSLY_REVIEWED':'REQUIRED',boats:[],candidateHosts:[]};
 if(result.status==='ALLOWED_READABLE') {
  report.boats=parsePublicFleet(html,source,report.checkedAt).map(b=>({shipId:b.shipId,name:b.name,calendarObserved:b.calendarObserved,events:result.events.filter(e=>e.uid===b.uid).length,parserFailure:result.shipFailures?.find(f=>f.shipId===b.shipId)?.message||null}));
  report.candidateHosts=discoverPublicHosts(html,host);
 }
 const out=resolve(`.audit/source-review-${host}.json`);await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(result.status!=='ALLOWED_READABLE') process.exitCode=1;
} finally {await server.close();}
