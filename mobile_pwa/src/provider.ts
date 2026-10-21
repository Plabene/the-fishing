import type { Boat, GateStatus, Observation } from './models';

export interface ProviderResult {
  status:GateStatus; events:Observation[]; message:string; observedAt?:string;
  httpStatus?:number; stage?:'detail'|'calendar'|'api'; stop?:boolean; cached?:boolean; source?:'direct'|'api';
}
export interface AvailabilityProvider { readMonth(boat:Boat,month:string,signal:AbortSignal):Promise<ProviderResult> }
// Available only from the explicit query button; startup never collects data.
export const LIVE_ENABLED=true;
export function classifyProbe(e:{status?:number; bodyReadable?:boolean; securityHtml?:boolean; corsDeniedProven?:boolean; authBlockedProven?:boolean; parserSupported?:boolean; permissionDenied?:boolean}):GateStatus {
  if(e.permissionDenied) return 'PERMISSION_DENIED';
  if(e.status===403 || e.status===429 || e.securityHtml) return 'ACCESS_RESTRICTED';
  if(e.status===401 || e.authBlockedProven) return 'AUTH_OR_COOKIE_BLOCKED';
  if(e.corsDeniedProven) return 'CORS_DENIED';
  if(e.status!==undefined && e.status!==200) return 'HTTP_ERROR';
  if(!e.bodyReadable || e.status===undefined) return 'UNVERIFIED';
  return e.parserSupported===true ? 'ALLOWED_READABLE' : 'PARSER_UNSUPPORTED';
}
