import {CATALOG_URL,parseCatalogPage,type CatalogPage} from '../scripts/lib/catalog.mjs';
import type {Store} from './service';
export type CatalogReply = {status:'OK';page:number;observedAt:string;cached:boolean;data:CatalogPage}|{status:'UNAVAILABLE';message:string};
interface Budget {day:string;count:number;lastStart:number;blockedUntil:number}
const unavailable=(message:string):CatalogReply=>({status:'UNAVAILABLE',message});
export const validCatalogPage=(page:string)=>/^(?:[1-9]\d?|100)$/.test(page);
/** Public metadata only. One serialized reader, persistent budget/cooldown and a one-day page cache. */
export class CatalogService {
  private pending=new Map<number,Promise<CatalogReply>>();
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private store:Store,private request:typeof fetch=(input,init)=>fetch(input,init),private now=()=>Date.now(),private gap=1000) {}
  query(page:number):Promise<CatalogReply> {
    if(!validCatalogPage(String(page))) return Promise.resolve(unavailable('목록 페이지는 1~100만 지원합니다.'));
    const pending=this.pending.get(page);if(pending) return pending;
    if(this.pending.size>=3) return Promise.resolve(unavailable('목록 조회가 진행 중입니다.'));
    const work=this.tail.then(()=>this.run(page)).catch(()=>unavailable('목록 처리 실패. 기존 목록을 유지합니다.')).finally(()=>this.pending.delete(page));
    this.pending.set(page,work);this.tail=work;return work;
  }
  private async run(page:number):Promise<CatalogReply> {
    const key=`catalog-page-v1:${page}`,cached=await this.store.get<{expires:number;result:CatalogReply}>(key);
    if(cached && cached.expires>this.now() && cached.result.status==='OK') return {...cached.result,cached:true};
    const now=this.now(),day=new Date(now).toISOString().slice(0,10),budget=await this.store.get<Budget>('catalog-budget') || {day,count:0,lastStart:0,blockedUntil:0};
    if(budget.blockedUntil>now) return unavailable('원본 목록 조회 중단 상태입니다. 기존 목록을 유지합니다.');
    if(budget.day!==day) {budget.day=day;budget.count=0;}
    if(budget.count>=100) return unavailable('목록 조회 일일 한도에 도달했습니다.');
    const delay=budget.lastStart+this.gap-this.now();if(delay>0) await new Promise(r=>setTimeout(r,delay));
    budget.count++;budget.lastStart=this.now();await this.store.put('catalog-budget',budget);
    try {
      const response=await this.request(CATALOG_URL+(page===1?'':`?page=${page}`),{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(response.status!==200) throw new Error(`목록 HTTP ${response.status}`);
      if(!response.headers.get('content-type')?.includes('text/html') || !response.body) throw new Error('목록 HTML 형식 오류');
      const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
      while(true) {const chunk=await reader.read();if(chunk.done) break;size+=chunk.value.byteLength;if(size>2000000) {await reader.cancel();throw new Error('목록 크기 초과');}parts.push(chunk.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts) {bytes.set(part,offset);offset+=part.length;}
      const data=parseCatalogPage(new TextDecoder('utf-8',{fatal:true}).decode(bytes),page);
      const result:CatalogReply={status:'OK',page,observedAt:new Date(this.now()).toISOString(),cached:false,data};
      await this.store.put(key,{expires:this.now()+86400000,result});return result;
    } catch(error) {
      // Do not retry an upstream error or expose raw HTML, credentials or transport internals.
      budget.blockedUntil=this.now()+600000;await this.store.put('catalog-budget',budget);
      const message=error instanceof Error && /^목록 HTTP \d{3}$/.test(error.message) ? error.message:'원본 목록 응답을 확인하지 못했습니다.';
      return unavailable(`${message} 자동 재시도 없이 기존 목록을 유지합니다.`);
    }
  }
}
