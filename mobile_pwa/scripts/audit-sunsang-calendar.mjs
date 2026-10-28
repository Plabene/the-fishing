// Explicit --live opt-in. Published catalog scope only; never claim a platform census.
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2),live=args.includes('--live'),useApi=args.includes('--api');
const current=new Date(Date.now()+9*3600000).toISOString().slice(0,7),next=new Date(current+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
const months=(args.find(a=>a.startsWith('--months='))?.slice(9)||`${current},${next.toISOString().slice(0,7)}`).split(',');
if(months.length>2 || months.some(m=>!/^20\d\d-(0[1-9]|1[0-2])$/.test(m))) throw new Error('Choose one or two months');
const out=resolve(args.find(a=>a.startsWith('--out='))?.slice(6)||'.audit/sunsang24-calendar.json');
const server=await createServer({root:resolve(import.meta.dirname,'..'),server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
 const load=p=>server.ssrLoadModule(p),{defaultFleet}=await load('/src/defaultFleet.ts'),{uniqueFleet}=await load('/src/fleetList.ts');
 const {boatPlatform,sunsangListing}=await load('/src/platforms.ts'),{commonRegion}=await load('/src/regions.ts');
 const {publicRouteForBoat}=await load('/src/sunsang24PublicRoutes.ts'),{Sunsang24PublicService}=await load('/availability_api/sunsang24Public.ts');
 const {Sunsang24PublicApi}=await load('/src/providers/sunsang24PublicApi.ts'),{auditCalendar}=await load('/src/calendarAudit.ts');
 const boats=uniqueFleet(defaultFleet().boats).filter(b=>boatPlatform(b)==='sunsang24');
 const data=new Map(),store={get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);}};
 let last=0;const paced=async(...params)=>{await new Promise(r=>setTimeout(r,Math.max(0,last+1000-Date.now())));last=Date.now();return fetch(...params);};
 const service=new Sunsang24PublicService(store,paced),origin=JSON.parse(await readFile(resolve(import.meta.dirname,'../src/data/apiEndpoint.json'),'utf8')).url;
 const report={checkedAt:new Date().toISOString(),scope:'PUBLISHED_SUNSANG24_CATALOG_ONLY',mode:live?(useApi?'DEPLOYED_API':'DIRECT_REVIEWED_PUBLIC_HOSTS'):'STATIC_ONLY',catalogTotal:boats.length,months,rows:[]};
 const save=async()=>{report.counts=report.rows.reduce((r,b)=>(r[b.month]??={},r[b.month][b.classification]=(r[b.month][b.classification]||0)+1,r),{});await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');};
 for(const month of months) {
  const raw=new Map(),request=async(url,options)=>{
   const u=new URL(url),host=u.searchParams.get('host');
   let result,status=200;if(useApi) {const response=await paced(url,options);status=response.status;if(!response.headers.get('content-type')?.includes('application/json')) throw new Error(`API HTTP ${status}: non-JSON response`);result=await response.json();}else result=await service.query(u.searchParams.get('ship'),month,host);
   raw.set(host,{...result,httpStatus:result.httpStatus||status});return new Response(JSON.stringify(result),{status,headers:{'content-type':'application/json'}});
  };
  const provider=new Sunsang24PublicApi(origin,request);
  // Finish one host at a time; sibling vessels reuse exactly one fresh response.
  const sorted=[...boats].sort((a,b)=>(publicRouteForBoat(a.uid)?.host||'').localeCompare(publicRouteForBoat(b.uid)?.host||''));
  for(const boat of sorted) {
   const route=publicRouteForBoat(boat.uid),row={uid:boat.uid,shipId:sunsangListing(boat.uid)?.shipId,name:boat.name,region:commonRegion(boat),url:boat.url,month,host:route?.host||'',sourceUrl:route?`https://${route.host}/ship/schedule_fleet/${month.replace('-','')}`:null,classification:route?'NOT_TESTED':'UNLINKED'};
   if(live && route) {
    const start=Date.now();let client;
    try {client=await provider.readMonth(boat,month,AbortSignal.timeout(35000));}
    catch {client={status:'TIMEOUT',events:[],message:'Audit request deadline exceeded',source:'api',stop:false};}
    const candidate=raw.get(route.host),source=candidate && Array.isArray(candidate.events) && typeof candidate.status==='string'?candidate:client;
    Object.assign(row,auditCalendar(boat,month,source,client),{status:client.status,message:client.message,httpStatus:source.httpStatus||client.httpStatus||null,observedAt:client.observedAt||null,fresh:client.fresh===true,cached:client.cached===true,elapsedMs:Date.now()-start});
    console.log(JSON.stringify({uid:row.uid,month,classification:row.classification,events:row.calendarEvents}));
   }
   report.rows.push(row);await save();
  }
 }
 report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({catalogTotal:report.catalogTotal,counts:report.counts}));
 if(process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,`\n선상24 등록 목록 ${report.catalogTotal}척의 월별 점검 (전국 전체 목록 보장 아님):\n\n\`\`\`json\n${JSON.stringify(report.counts,null,2)}\n\`\`\`\n미연결은 일정 없음과 다릅니다. 전체 선박별 근거는 sunsang24-audit 아티팩트에 있습니다.\n`,{flag:'a'});
 if(live && report.rows.some(r=>['SOURCE_FAILED','CALENDAR_MISMATCH'].includes(r.classification))) process.exitCode=1;
} finally {await server.close();}
