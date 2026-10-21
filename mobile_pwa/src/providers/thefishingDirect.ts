import { LIVE_GATE, type AvailabilityProvider, type ProviderResult } from '../provider';
import { officialDetail } from '../models';

/** Intentionally has no network transport. Importing evidence cannot enable live collection. */
export class TheFishingDirect implements AvailabilityProvider {
  validateDetail(url: string): boolean { return !!officialDetail(url); }
  async readMonth(_month: string, signal: AbortSignal): Promise<ProviderResult> {
    if (signal.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    return { status: LIVE_GATE, events: [], message: '운영자 허가와 실제 모바일 검증이 없어 실시간 조회를 사용하지 않습니다.' };
  }
}
