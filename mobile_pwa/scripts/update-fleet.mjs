// Only public directory cards; no seat calendars, accounts, cookies or detail crawling.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {CATALOG_URL,collectRegionalCatalog,parseCatalogPage,mergePublishedFleet} from './lib/catalog.mjs';
if(!process.argv.includes('--live')) throw new Error('Use --live for the public directory update.');
const path=resolve(import.meta.dirname,'../src/data/defaultFleet.json'),previous=JSON.parse(await readFile(path,'utf8'));
const useApi=process.argv.includes('--api'),api=JSON.parse(await readFile(resolve(import.meta.dirname,'../src/data/apiEndpoint.json'),'utf8')).url;
if(useApi && !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(api)) throw new Error('설정된 목록 API 주소를 확인하세요.');
let last=0;const observed=[];
const result=await collectRegionalCatalog(async (page,area)=>{
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,last+1000-Date.now())));last=Date.now();
  const url=new URL(useApi ? `${api}/v1/catalog`:CATALOG_URL);url.searchParams.set('page',String(page));if(area) url.searchParams.set(useApi?'area':'sa[]',area);
  const response=await fetch(url,{redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(response.status!==200) throw new Error(`목록 HTTP ${response.status}; 재시도 없이 기존 목록 유지`);
  if(!response.headers.get('content-type')?.includes(useApi?'application/json':'text/html')) throw new Error('목록 응답 형식이 다릅니다.');
  const reader=response.body.getReader(),parts=[];let size=0;
  while(true) {const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>2000000) {await reader.cancel();throw new Error('목록 응답 크기 초과');}parts.push(value);}
  const content=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  if(!useApi) {observed.push(new Date().toISOString());return parseCatalogPage(content,page);}
  const value=JSON.parse(content),time=Date.parse(value.observedAt);
  if(value.status!=='OK' || value.page!==page || (value.area || '')!==area || !Number.isFinite(time) || time>Date.now()+60000 || Date.now()-time>86400000) throw new Error('목록 API 페이지·지역 또는 확인 시각 오류');
  observed.push(value.observedAt);return value.data;
},(page,total)=>console.log(`catalog ${page}/${total}`));
const state={...previous.state,boats:mergePublishedFleet(previous.state.boats,result.boats)};
const known=new Set(state.boats.map(b=>b.uid));
if([...state.selectedUids,...Object.values(state.tiers).flat()].some(id=>!known.has(id))) throw new Error('기존 선택·티어 선박이 누락됐습니다.');
const version=createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0,16);
const next={version,state,catalog:{checkedAt:observed.sort()[0],completedAt:new Date().toISOString(),source:CATALOG_URL,listed:result.total,nationalListed:result.nationalListed,listedCards:result.listedCards,regionalCards:result.regionalCards,duplicates:result.duplicates,conflicts:result.conflicts,pages:result.pages,regions:result.regions,regionalAdded:result.regionalAdded,coverage:result.coverage,complete:result.complete,retained:state.boats.length-result.total}};
const temporary=path+'.tmp';await writeFile(temporary,JSON.stringify(next,null,2)+'\n');await rename(temporary,path);
const report={...next.catalog,total:state.boats.length,added:state.boats.length-previous.state.boats.length,version};
console.log(JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,`더피싱 전체 목록 ${result.pages}페이지·${result.listedCards}개 카드에서 ${result.nationalListed}개 UID 확인. 공식 지역 ${result.regions.length}개를 추가 검사해 ${result.regionalAdded}개 UID 보완, 이번 확인 합계 ${result.total}개 UID. 전체 목록 카드 중복 ${result.duplicates}개, 정보 충돌 ${result.conflicts}건. 페이지 간 중복 때문에 전국 완전 수집을 보장하지 않으며 미노출 선박은 삭제하지 않습니다. 기존·외부 항목 포함 ${state.boats.length}개, 신규 ${report.added}개. 개인 티어·선택은 변경하지 않습니다.\n`,{flag:'a'});
