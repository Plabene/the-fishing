// Offline coverage by default. --live checks each reviewed Sunsang homepage once,
// plus up to five TheFishing vessels per region. No customer or seat data is saved.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2),live=args.includes('--live');
const fishingOnly=args.includes('--thefishing-only'),sampleLimit=Number(args.find(a=>a.startsWith('--sample-limit='))?.slice(15) || 5);
if(!Number.isInteger(sampleLimit) || sampleLimit<0 || sampleLimit>1000) throw new Error('Invalid sample limit');
const month=args.find(a=>a.startsWith('--month='))?.slice(8) || new Date(Date.now()+9*3600000).toISOString().slice(0,7);
if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
const path=resolve(args.find(a=>a.startsWith('--out='))?.slice(6) || '.audit/availability.json');
const server=await createServer({root:resolve(import.meta.dirname,'..'),server:{middlewareMode:true},appType:'custom'});
try {
 const load=p=>server.ssrLoadModule(p);
 const {defaultFleet}=await load('/src/defaultFleet.ts'),{uniqueFleet,supportsLive}=await load('/src/fleetList.ts');
 const {boatPlatform}=await load('/src/platforms.ts'),{commonRegion}=await load('/src/regions.ts');
 const {publicRouteForBoat}=await load('/src/sunsang24PublicRoutes.ts');
 const {Sunsang24PublicService}=await load('/availability_api/sunsang24Public.ts'),{MonthlyService}=await load('/availability_api/service.ts');
 const rows=uniqueFleet(defaultFleet().boats).map(b=>({uid:b.uid,name:b.name,platform:boatPlatform(b),region:commonRegion(b),linked:supportsLive(b),host:publicRouteForBoat(b.uid)?.host || '',status:supportsLive(b)?'NOT_TESTED':'UNLINKED'}));
 const coverage={};for(const b of rows) {const k=`${b.region.sea || '미확인'}/${b.platform}`,r=coverage[k]||={total:0,linked:0};r.total++;if(b.linked) r.linked++;}
 const store=()=>{const data=new Map();return {get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);}};};
 const report={checkedAt:new Date().toISOString(),month,mode:live?'LIVE_SUNSANG_HOSTS_AND_THEFISHING_REGIONAL_SAMPLE':'STATIC_ONLY',total:rows.length,sampleLimit,fishingOnly,coverage,rows};
 const save=async()=>{await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');};
 await save();console.log(JSON.stringify({total:rows.length,coverage}));
 if(live) {
  let last=0;
  const paced=async(...args)=>{await new Promise(r=>setTimeout(r,Math.max(0,last+1000-Date.now())));last=Date.now();return fetch(...args);};
  const service=new Sunsang24PublicService(store(),paced),hosts=new Map();
  for(const b of rows.filter(b=>!fishingOnly && b.platform==='sunsang24' && b.linked)) {const group=hosts.get(b.host)||[];group.push(b);hosts.set(b.host,group);}
  for(const [host,group] of hosts) {
   const start=Date.now(),ship=group[0].uid.split(':').at(-1),result=await service.query(ship,month,host);
   for(const b of group) {const id=publicRouteForBoat(b.uid).ships.find(id=>b.uid===`sunsang24:ship:${id}`) || (await load('/src/platforms.ts')).sunsangListing(b.uid).shipId;
    const broken=result.shipFailures?.find(x=>x.shipId===id),events=result.events.filter(e=>e.uid===`sunsang24:ship:${id}`);
    Object.assign(b,{status:broken?'PARSER_UNSUPPORTED':result.status==='ALLOWED_READABLE'&&!result.shipIds?.includes(id)?'UNVERIFIED':result.status,events:events.length,available:events.filter(e=>e.verified && e.reservationStatus==='available' && e.remaining>0).length,empty:result.status==='ALLOWED_READABLE'&&result.shipIds?.includes(id)&&!events.length,observedAt:result.observedAt || null,httpStatus:result.httpStatus || null,message:broken?.message || result.message,dateValid:events.every(e=>e.date.startsWith(month+'-')),elapsedMs:Date.now()-start});
   }
   console.log(JSON.stringify({host,status:result.status,events:result.events.length,ships:group.length,elapsedMs:Date.now()-start}));await save();
  }
  const monthly=new MonthlyService(store()),regionCount=new Map();
  for(const b of rows.filter(b=>b.platform==='thefishing' && b.linked)) {
   const key=b.region.sea || '미확인';if((regionCount.get(key)||0)>=sampleLimit) continue;regionCount.set(key,(regionCount.get(key)||0)+1);
   const start=Date.now(),result=await monthly.query(b.uid,month);
   Object.assign(b,{status:result.status,events:result.events.length,empty:result.status==='ALLOWED_READABLE'&&!result.events.length,observedAt:result.observedAt || null,httpStatus:result.httpStatus || null,message:result.message,dateValid:result.events.every(e=>e.date.startsWith(month+'-')),elapsedMs:Date.now()-start});await save();
   console.log(JSON.stringify({uid:b.uid,region:key,status:result.status,events:result.events.length}));if(result.stop) break;
  }
  report.finishedAt=new Date().toISOString();report.counts=rows.reduce((a,b)=>(a[b.status]=(a[b.status]||0)+1,a),{});await save();
 }
}finally{await server.close();}
