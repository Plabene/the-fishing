import type {TideDay} from './tides';
import {TIDE_TTL,tideDates} from './tides';
import type {TideStationCode} from './tideStations';

/** One active station/month, cancellable on scope changes; failures never become retry loops. */
export class TideAutoLoad {
  private key='';private controller:AbortController|null=null;private lastAttempts=new Map<string,number>();
  constructor(private read:(station:TideStationCode,month:string,signal:AbortSignal)=>Promise<{days:TideDay[];message:string}>,
    private apply:(days:TideDay[],signal:AbortSignal)=>Promise<void>,private status:(message:string)=>void,private now=()=>Date.now()) {}
  async sync(station:TideStationCode|null,month:string,days:TideDay[],enabled:boolean,force=false) {
    const key=enabled && station?`${station}/${month}`:'';
    if(key!==this.key) {this.controller?.abort();this.controller=null;this.key=key;this.status('');}
    if(!key || !station || this.controller) return;
    const dates=tideDates(month),fresh=new Set(days.filter(d=>d.stationCode===station && this.now()-Date.parse(d.fetchedAt)<TIDE_TTL).map(d=>d.date));
    if(!force && (dates.every(d=>fresh.has(d)) || this.now()-(this.lastAttempts.get(key)||0)<60000)) return;
    const controller=new AbortController();this.controller=controller;this.lastAttempts.set(key,this.now());
    this.status('선택 지역의 공식 물때 확인 중…');
    try {const result=await this.read(station,month,controller.signal);controller.signal.throwIfAborted();await this.apply(result.days,controller.signal);controller.signal.throwIfAborted();if(this.key===key) this.status(result.message);}
    catch {if(!controller.signal.aborted && this.key===key) this.status('공식 물때를 갱신하지 못했습니다. 같은 지점의 기존 물때·예약 조회 자료는 유지합니다. 잠시 후 새로고침하세요.');}
    finally {if(this.controller===controller) this.controller=null;}
  }
}
