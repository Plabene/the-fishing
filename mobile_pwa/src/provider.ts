import type { GateStatus, Observation } from './models';

export interface AccessEvidence {
  origin: string; writtenPermission: boolean; detailGetReadable: boolean;
  calendarPostReadable: boolean; preflightValid: boolean; credentialsValid: boolean;
  androidChrome: boolean; iosSafari: boolean; parserValidated: boolean;
}
export interface ProviderResult { status: GateStatus; events: Observation[]; message: string }
export interface AvailabilityProvider { readMonth(month: string, signal: AbortSignal): Promise<ProviderResult> }
export const LIVE_ENABLED = false as const;
export const LIVE_GATE: GateStatus = 'UNVERIFIED';
export function evidenceAllowsLive(e: AccessEvidence, origin: string): boolean {
  try { if (new URL(e.origin).origin !== origin || e.origin !== origin || !origin.startsWith('https://')) return false; }
  catch { return false; }
  return e.writtenPermission && e.detailGetReadable && e.calendarPostReadable && e.preflightValid &&
    e.credentialsValid && e.androidChrome && e.iosSafari && e.parserValidated;
}
export function classifyProbe(e: { status?: number; bodyReadable?: boolean; securityHtml?: boolean;
  corsDeniedProven?: boolean; authBlockedProven?: boolean; parserSupported?: boolean; permissionDenied?: boolean }): GateStatus {
  if (e.permissionDenied) return 'PERMISSION_DENIED';
  if (e.status === 403 || e.status === 429 || e.securityHtml) return 'ACCESS_RESTRICTED';
  if (e.status === 401 || e.authBlockedProven) return 'AUTH_OR_COOKIE_BLOCKED';
  if (e.corsDeniedProven) return 'CORS_DENIED';
  if (!e.bodyReadable || e.status === undefined) return 'UNVERIFIED';
  if (e.status !== 200 || e.parserSupported === false) return 'PARSER_UNSUPPORTED';
  return e.parserSupported === true ? 'ALLOWED_READABLE' : 'UNVERIFIED';
}
