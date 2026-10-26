import {CATALOG_URL,parseCatalogPage,type CatalogPage} from '../scripts/lib/catalog.mjs';
import type {Store} from './service';
export type CatalogReply = {status:'OK';page:number;area?:string;observedAt:string;cached:boolean;data:CatalogPage}|{status:'UNAVAILABLE';message:string};
interface Budget {day:string;count:number;lastStart:number;blockedUntil:number}
const unavailable=(message:string):CatalogReply=>({status:'UNAVAILABLE',message});
export const validCatalogPage=(page:string)=>/^(?:[1-9]\d?|100)$/.test(page);
export const validCatalogArea=(area:string)=>/^[1-9]\d{0,3}$/.test(area);
/** Public metadata only. One serialized reader, persistent budget/cooldown and a one-day page cache. */
export class CatalogService {
  private pending=new Map<string,Promise<CatalogReply>>();
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private store:Store,private request:typeof fetch=(input,init)=>fetch(input,init),private now=()=>Date.now(),private gap=1000) {}
  query(page:number,area=''):Promise<CatalogReply> {
    if(!validCatalogPage(String(page)) || (area && !validCatalogArea(area))) return Promise.resolve(unavailable('목록 페이지·지역을 확인하세요.'));
    const key=`${area}:${page}`,pending=this.pending.get(key);if(pending) return pending;
    if(this.pending.size>=3) return Promise.resolve(unavailable('목록 조회가 진행 중입니다.'));
    const work=this.tail.then(()=>this.run(page,area)).catch(()=>unavailable('목록 처리 실패. 기존 목록을 유지합니다.')).finally(()=>this.pending.delete(key));
    this.pending.set(key,work);this.tail=work;return work;
  }
  private async run(page:number,area=''):Promise<CatalogReply> {
    const key=`catalog-page-v2:${area}:${page}`,cached=await this.store.get<{expires:number;result:CatalogReply}>(key);
    if(cached && cached.expires>this.now() && cached.result.status==='OK') return {...cached.result,cached:true};
    if(area) {
      const directory=await this.run(1);
      if(directory.status!=='OK' || !directory.data.areas?.some(a=>a.id===area)) return unavailable('공개 검색 양식에서 확인되지 않은 지역입니다.');
    }
    const now=this.now(),day=new Date(now).toISOString().slice(0,10),budget=await this.store.get<Budget>('catalog-budget') || {day,count:0,lastStart:0,blockedUntil:0};
    if(budget.blockedUntil>now) return unavailable('원본 목록 조회 중단 상태입니다. 기존 목록을 유지합니다.');
    if(budget.day!==day) {budget.day=day;budget.count=0;}
    if(budget.count>=200) return unavailable('목록 조회 일일 한도에 도달했습니다.');
    for(let attempt=0;attempt<2;attempt++) {
    if(budget.count>=200) return unavailable('목록 조회 일일 한도에 도달했습니다.');
    const delay=budget.lastStart+this.gap-this.now();if(delay>0) await new Promise(r=>setTimeout(r,delay));
    budget.count++;budget.lastStart=this.now();await this.store.put('catalog-budget',budget);
    try {
      const url=new URL(CATALOG_URL);if(page!==1) url.searchParams.set('page',String(page));if(area) url.searchParams.set('sa[]',area);
      const response=await this.request(url.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(response.status!==200) {await response.body?.cancel();throw new Error(`목록 HTTP ${response.status}`);}
      if(!response.headers.get('content-type')?.includes('text/html') || !response.body) throw new Error('목록 HTML 형식 오류');
      const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
      while(true) {const chunk=await reader.read();if(chunk.done) break;size+=chunk.value.byteLength;if(size>2000000) {await reader.cancel();throw new Error('목록 크기 초과');}parts.push(chunk.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts) {bytes.set(part,offset);offset+=part.length;}
      const data=parseCatalogPage(new TextDecoder('utf-8',{fatal:true}).decode(bytes),page);
      const result:CatalogReply={status:'OK',page,...(area ? {area}:{}),observedAt:new Date(this.now()).toISOString(),cached:false,data};
      await this.store.put(key,{expires:this.now()+86400000,result});return result;
    } catch(error) {
      // Retry only transient transport/5xx failures once. Never retry access restrictions or malformed HTML.
      const transient=error instanceof TypeError || error instanceof Error && (/^목록 HTTP 50[0234]$/.test(error.message) || ['TimeoutError','AbortError'].includes(error.name));
      if(transient && attempt===0) continue;
      budget.blockedUntil=this.now()+600000;await this.store.put('catalog-budget',budget);
      const message=error instanceof Error && /^목록 HTTP \d{3}$/.test(error.message) ? error.message:'원본 목록 응답을 확인하지 못했습니다.';
      return unavailable(`${message} ${transient?'일시 오류 재시도 후에도 실패했습니다. ':''}기존 목록을 유지합니다.`);
    }
    }
    return unavailable('목록 조회 미완료. 기존 목록을 유지합니다.');
  }
}
