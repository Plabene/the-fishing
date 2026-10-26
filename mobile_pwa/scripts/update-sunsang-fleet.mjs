import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {robotsAllows} from './lib/robots.mjs';
import {parsePublicFleet,validatePublicFleet} from './lib/public-fleet.mjs';
import {prepareCatalogRefresh} from './lib/catalog-refresh.mjs';
if(!process.argv.includes('--live')) throw new Error('Use --live for registered public vessel pages.');
const path=resolve(import.meta.dirname,'../src/data/sunsang24Fleet.json'),previous=JSON.parse(await readFile(path,'utf8'));
const sources=JSON.parse(await readFile(resolve(import.meta.dirname,'../src/data/sunsang24CatalogSources.json'),'utf8')).sources;
const syncPath=resolve(import.meta.dirname,'../src/data/catalogSync.json'),previousSync=JSON.parse(await readFile(syncPath,'utf8'));
const useApi=process.argv.includes('--api'),api=JSON.parse(await readFile(resolve(import.meta.dirname,'../src/data/apiEndpoint.json'),'utf8')).url;
if(useApi && !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(api)) throw new Error('설정된 목록 API 주소를 확인하세요.');
let last=0;const deadline=Date.now()+300000;
async function get(url,max,type) {
  for(let attempt=0;attempt<2;attempt++) {
    if(Date.now()>=deadline) throw new Error('수집 시간 한도 초과');
    await new Promise(r=>setTimeout(r,Math.max(0,last+1000-Date.now())));last=Date.now();
    try {
      const response=await fetch(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{'User-Agent':'TheFishingAvailability/1.0 (+https://github.com/Plabene/the-fishing)'},signal:AbortSignal.timeout(Math.max(1,Math.min(25000,deadline-Date.now())))});
      if(response.status!==200) {await response.body?.cancel();const error=new Error(`HTTP ${response.status}`);error.transient=[500,502,503,504].includes(response.status);throw error;}
      if(!response.headers.get('content-type')?.includes(type)) throw new Error('응답 형식 변경');
      const reader=response.body.getReader(),parts=[];let size=0;
      for(;;) {const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>max) {await reader.cancel();throw new Error('응답 크기 초과');}parts.push(value);}
      return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
    } catch(error) {if(attempt===0 && (error.transient || error.name==='TimeoutError' || error instanceof TypeError && !/redirect/i.test(error.message))) continue;throw error;}
  }
}
const results=[],reports=[];
for(const source of sources) {
  if(!/^[a-z0-9-]+\.sunsang24\.com$/.test(source.host) || ['api','service','www'].includes(source.host.split('.')[0])) throw new Error('공개 선사 주소만 수집할 수 있습니다.');
  const url=`https://${source.host}/ship/schedule_fleet`;
  try {
    let boats,at;
    if(useApi) {const value=JSON.parse(await get(`${api}/v1/sunsang24/catalog?host=${source.host}`,1000000,'application/json'));boats=validatePublicFleet(value,source);at=value.observedAt;}
    else {const robots=await get(`https://${source.host}/robots.txt`,100000,'text/plain');if(!robotsAllows(robots,'/ship/schedule_fleet')) throw new Error('robots 접근 제한');const html=await get(url,12000000,'text/html');at=new Date().toISOString();boats=parsePublicFleet(html,source,at);}
    results.push(boats);
    reports.push({host:source.host,status:'OK',checkedAt:at,listed:boats.length,shipIds:boats.map(b=>b.shipId)});console.log(`public directory ${source.host} ${boats.length}`);
  } catch(error) {reports.push({host:source.host,status:'UNAVAILABLE',checkedAt:new Date().toISOString(),message:/^(HTTP \d{3}|robots 접근 제한|응답 형식 변경|응답 크기 초과|수집 시간 한도 초과)$/.test(error.message)?error.message:'선박 목록 또는 지역 근거 재확인 필요'});console.log(`public directory ${source.host} UNAVAILABLE; retain old entries`);}
}
const {next,report}=prepareCatalogRefresh(previous,results,reports,previousSync,new Date().toISOString());
await writeFile(syncPath+'.tmp',JSON.stringify(report,null,2)+'\n');await rename(syncPath+'.tmp',syncPath);
if(!results.length) throw new Error('모든 공개 목록 확인 실패. 기존 목록·티어는 보존하고 실패 시각만 기록했습니다.');
await writeFile(path+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(path+'.tmp',path);
console.log(JSON.stringify({...report,missingShipIds:undefined}));
if(process.env.GITHUB_ACTIONS && (report.failedSources || report.conflicts)) console.log(`::warning::Sunsang24 directory refresh: ${report.failedSources} unavailable sources, ${report.conflicts} identity conflicts; previous entries retained.`);
if(process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,`선상24 공개 선사 ${sources.length}곳: 확인 ${report.observedUnique}개 ID, 누적 ${report.total}개, 신규 ${report.added}개, 변경 ${report.changed}개, 실패 ${report.failedSources}곳. 중앙 API 자동 수집은 사용하지 않습니다. 전국 완전 목록이 아니며 실패·미노출 항목과 개인 티어를 보존합니다.\n`,{flag:'a'});
