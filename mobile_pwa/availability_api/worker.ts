import type { DurableObjectNamespace, DurableObjectState, ExportedHandler } from '@cloudflare/workers-types';
import { apiFailure, MonthlyService, validQuery, type Store } from './service';
import { TideService } from './tides';
import {CatalogService,validCatalogPage,validCatalogArea} from './catalog';
import {Sunsang24Service,SUNSANG_AREAS} from './sunsang24';
import {Sunsang24PublicService,PUBLIC_CATALOG_SOURCES} from './sunsang24Public';
import {publicRouteForShip,reviewedPublicHost,legacyPublicShipIds,SUNSANG_PUBLIC_SHIP_COUNT} from '../src/sunsang24PublicRoutes';

interface Env {MONTHLY:DurableObjectNamespace; ALLOWED_ORIGIN:string; KHOA_TIDE_API_KEY?:string}
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
// Operational counts only; never log original HTML, customer names, memos or seats.
function logQuery(platform:string,id:string,month:string,started:number,result:{status:string;events:unknown[];httpStatus?:number;stage?:string}) {
  console.info(JSON.stringify({event:'availability_query',platform,id,month,status:result.status,httpStatus:result.httpStatus,stage:result.stage,events:result.events.length,elapsedMs:Date.now()-started}));
}
export class MonthlyCoordinator {
  private service:MonthlyService;
  private tides:TideService;
  private catalog:CatalogService;
  private sunsang:Sunsang24Service;
  private sunsangPublic:Sunsang24PublicService;
  constructor(ctx:DurableObjectState,env:Env) {this.service=new MonthlyService(ctx.storage as unknown as Store);this.tides=new TideService(ctx.storage as unknown as Store,env.KHOA_TIDE_API_KEY);this.catalog=new CatalogService(ctx.storage as unknown as Store);this.sunsang=new Sunsang24Service(ctx.storage as unknown as Store);this.sunsangPublic=new Sunsang24PublicService(ctx.storage as unknown as Store);}
  async fetch(request:Request):Promise<Response> {
    const u=new URL(request.url);
    if(u.pathname==='/v1/sunsang24/catalog') {const result=await this.sunsangPublic.catalog(u.searchParams.get('host') || '');return json(result,result.status==='OK'?200:503);}
    if(u.pathname==='/v1/sunsang24/public-month') {
      const started=Date.now(),ship=u.searchParams.get('ship') || '',month=u.searchParams.get('month') || '',result=await this.sunsangPublic.query(ship,month,u.searchParams.get('host') || undefined);
      logQuery('sunsang24',ship,month,started,result);return json(result);
    }
    if(u.pathname==='/v1/sunsang24/month') return json(await this.sunsang.query(u.searchParams.get('area') || '',u.searchParams.get('month') || ''));
    if(u.pathname==='/v1/catalog') {
      try {const result=await this.catalog.query(Number(u.searchParams.get('page')),u.searchParams.get('area') || '');return json(result,result.status==='OK'?200:503);}
      catch {return json({status:'UNAVAILABLE',message:'목록 처리 실패. 기존 목록을 유지합니다.'},503);}
    }
    try {
      if(u.pathname==='/v1/tides') return json(await this.tides.query(u.searchParams.get('month') || ''));
      const started=Date.now(),uid=u.searchParams.get('uid') || '',month=u.searchParams.get('month') || '',result=await this.service.query(uid,month);
      logQuery('thefishing',uid,month,started,result);return json(result);
    }
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
  if(url.pathname==='/v1/sunsang24/catalog') {
    const host=url.searchParams.get('host') || '';
    if(!PUBLIC_CATALOG_SOURCES.has(host) || url.searchParams.getAll('host').length!==1 || [...url.searchParams.keys()].some(k=>k!=='host')) return json({status:'UNAVAILABLE',message:'검증된 공개 선사 주소만 지원합니다.'},400,headers);
    try {const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('sunsang24-public-v1')),response=await coordinator.fetch(new Request(`https://coordinator/v1/sunsang24/catalog?host=${host}`) as never);return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
    catch {return json({status:'UNAVAILABLE',message:'공개 선사 목록 서버 응답 실패. 기존 목록 유지'},503,headers);}
  }
  if(url.pathname==='/health' && !url.search) return json({service:'thefishing-availability',schema:1,ready:!!env.MONTHLY,tidesReady:!!env.KHOA_TIDE_API_KEY,platforms:{thefishing:'enabled',sunsang24:'public_homepages',sunsang24CentralApi:'permission_required'},sunsang24PublicShips:SUNSANG_PUBLIC_SHIP_COUNT},env.MONTHLY ? 200:503,headers);
  if(url.pathname==='/v1/sunsang24/public-month') {
    const ship=url.searchParams.get('ship') || '',month=url.searchParams.get('month') || '';
    const host=url.searchParams.get('host');
    if((host!==null ? !reviewedPublicHost(host) || url.searchParams.getAll('host').length!==1:!publicRouteForShip(ship)) || !validQuery(ship,month) || ['ship','month','fresh'].some(k=>url.searchParams.getAll(k).length!==1) || url.searchParams.get('fresh')!=='1' || [...url.searchParams.keys()].some(k=>!['ship','month','fresh','host'].includes(k))) return json(apiFailure('PARSER_UNSUPPORTED','확인된 선박 ID와 조회 월이 필요합니다.'),400,headers);
    try {
      const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('sunsang24-public-v1'));
      const response=await coordinator.fetch(new Request(`https://coordinator/v1/sunsang24/public-month?ship=${ship}&month=${month}${host?'&host='+host:''}`) as never);
      let body=await response.text();
      if(!host && response.ok) {
        const value=JSON.parse(body),ids=new Set(legacyPublicShipIds(publicRouteForShip(ship)!.host));
        if(value.status==='ALLOWED_READABLE' && Array.isArray(value.shipIds) && Array.isArray(value.events)) body=JSON.stringify({...value,shipIds:value.shipIds.filter((id:string)=>ids.has(id)),events:value.events.filter((e:{uid:string})=>ids.has(e.uid.replace('sunsang24:ship:','')))});
      }
      return new Response(body,{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
    } catch {return json({...apiFailure('API_UNAVAILABLE','선상24 공개 예약표 서버에 연결하지 못했습니다.'),stop:false},503,headers);}
  }
  if(url.pathname==='/v1/catalog') {
    const page=url.searchParams.get('page') || '';
    const area=url.searchParams.get('area') || '';
    if(!validCatalogPage(page) || url.searchParams.getAll('page').length!==1 || url.searchParams.has('area') && (!validCatalogArea(area) || url.searchParams.getAll('area').length!==1) || [...url.searchParams.keys()].some(k=>!['page','area'].includes(k))) return json({status:'UNAVAILABLE',message:'목록 페이지·지역을 확인하세요.'},400,headers);
    try {
      const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('catalog-v1'));
      const response=await coordinator.fetch(new Request(`https://coordinator/v1/catalog?page=${page}${area?'&area='+area:''}`) as never);
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
  if(url.pathname==='/v1/sunsang24/month') {
    const area=url.searchParams.get('area') || '',month=url.searchParams.get('month') || '';
    if(!SUNSANG_AREAS.has(area) || !validQuery('1',month) || ['area','month','fresh'].some(k=>url.searchParams.getAll(k).length!==1) || url.searchParams.get('fresh')!=='1' || [...url.searchParams.keys()].some(k=>!['area','month','fresh'].includes(k))) return json(apiFailure('PARSER_UNSUPPORTED','선상24 조회 조건을 확인하세요.'),400,headers);
    try {
      const coordinator=env.MONTHLY.get(env.MONTHLY.idFromName('sunsang24-v1'));
      const response=await coordinator.fetch(new Request(`https://coordinator/v1/sunsang24/month?area=${area}&month=${month}`) as never);
      return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
    } catch {return json(apiFailure('API_UNAVAILABLE','선상24 조회 서버에 연결하지 못했습니다.'),503,headers);}
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
