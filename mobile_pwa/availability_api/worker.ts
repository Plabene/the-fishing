import type { DurableObjectNamespace, DurableObjectState, ExportedHandler } from '@cloudflare/workers-types';
import { apiFailure, MonthlyService, validQuery, type Store } from './service';
import { TideService } from './tides';
import {CatalogService,validCatalogPage} from './catalog';

interface Env {MONTHLY:DurableObjectNamespace; ALLOWED_ORIGIN:string; KHOA_TIDE_API_KEY?:string}
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export class MonthlyCoordinator {
  private service:MonthlyService;
  private tides:TideService;
  private catalog:CatalogService;
  constructor(ctx:DurableObjectState,env:Env) {this.service=new MonthlyService(ctx.storage as unknown as Store);this.tides=new TideService(ctx.storage as unknown as Store,env.KHOA_TIDE_API_KEY);this.catalog=new CatalogService(ctx.storage as unknown as Store);}
  async fetch(request:Request):Promise<Response> {
    const u=new URL(request.url);
    if(u.pathname==='/v1/catalog') {
      try {const result=await this.catalog.query(Number(u.searchParams.get('page')));return json(result,result.status==='OK'?200:503);}
      catch {return json({status:'UNAVAILABLE',message:'목록 처리 실패. 기존 목록을 유지합니다.'},503);}
    }
    try {return json(u.pathname==='/v1/tides' ? await this.tides.query(u.searchParams.get('month') || ''):await this.service.query(u.searchParams.get('uid') || '',u.searchParams.get('month') || ''));}
    catch {return json(apiFailure('API_UNAVAILABLE','조회 서버 처리에 실패했습니다. 잠시 후 다시 시도하세요.'),503);}
  }
}
export async function handleRequest(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url), origin=request.headers.get('Origin'), allowed=env.ALLOWED_ORIGIN;
  // CORS restricts browser callers, not server callers; global budget is enforced in the coordinator.
  if(!allowed || (origin && origin!==allowed)) return json(apiFailure('API_UNAVAILABLE','허용되지 않은 웹앱 출처입니다.'),403);
  const headers:Record<string,string>={'Access-Control-Allow-Origin':allowed,'Vary':'Origin'};
  if(request.method==='OPTIONS') {
    if(request.headers.get('Access-Control-Request-Method')!=='GET' || request.headers.get('Access-Control-Request-Headers')) return json({},405,headers);
    return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Max-Age':'600'}});
  }
  if(request.method!=='GET') return json(apiFailure('API_UNAVAILABLE','GET 요청만 지원합니다.'),405,headers);
  if(url.pathname==='/health' && !url.search) return json({service:'thefishing-availability',schema:1,ready:!!env.MONTHLY,tidesReady:!!env.KHOA_TIDE_API_KEY},env.MONTHLY ? 200:503,headers);
  if(url.pathname==='/v1/catalog') {
    const page=url.searchParams.get('page') || '';
    if(!validCatalogPage(page) || url.searchParams.getAll('page').length!==1 || [...url.searchParams.keys()].some(k=>k!=='page')) return json({status:'UNAVAILABLE',message:'목록 페이지를 확인하세요.'},400,headers);
    try {
      const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('catalog-v1'));
      const response=await coordinator.fetch(new Request(`https://coordinator/v1/catalog?page=${page}`) as never);
      return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
    } catch {return json({status:'UNAVAILABLE',message:'목록 조회 서버에 연결하지 못했습니다.'},503,headers);}
  }
  if(url.pathname==='/v1/tides') {
    const month=url.searchParams.get('month') || '';
    if(!validQuery('1',month) || url.searchParams.getAll('month').length!==1 || [...url.searchParams.keys()].some(k=>k!=='month')) return json({message:'물때 조회 월을 확인하세요.'},400,headers);
    try {
      const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('tides-v1'));
      const response=await coordinator.fetch(new Request(`https://coordinator/v1/tides?month=${month}`) as never);
      return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
    } catch {return json({message:'물때 조회 서버에 연결하지 못했습니다.'},503,headers);}
  }
  if(url.pathname!=='/v1/month') return json(apiFailure('API_UNAVAILABLE','지원하지 않는 API 경로입니다.'),404,headers);
  const uid=url.searchParams.get('uid') || '',month=url.searchParams.get('month') || '';
  const fresh=url.searchParams.getAll('fresh');
  if(!validQuery(uid,month) || [...url.searchParams.keys()].some(k=>!['uid','month','fresh'].includes(k)) || url.searchParams.getAll('uid').length!==1 || url.searchParams.getAll('month').length!==1 || (fresh.length>0 && (fresh.length!==1 || fresh[0]!=='1'))) return json(apiFailure('PARSER_UNSUPPORTED','조회 조건을 확인하세요.'),400,headers);
  try {
    const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('monthly-v1'));
    const response=await coordinator.fetch(new Request(`https://coordinator/v1/month?uid=${uid}&month=${month}`) as never);
    return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
  } catch {return json(apiFailure('API_UNAVAILABLE','조회 서버에 연결하지 못했습니다.'),503,headers);}
}
export default {fetch:handleRequest} as unknown as ExportedHandler<Env>;
