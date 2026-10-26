export type QueryOutcome='조회 완료'|'조회 일부 완료'|'조회 취소'|'조회 중단'|'조회 실패';

/** Elapsed wall time advances even while the first response is pending. No guessed ETA. */
export class QueryProgress {
  private timer:ReturnType<typeof setInterval>|undefined;
  private started=0;
  private total=0;
  private completed=0;
  private success=0;
  constructor(private root:HTMLElement,private now=()=>performance.now()) {}
  private get<T extends HTMLElement>(selector:string) {return this.root.querySelector<T>(selector)!;}
  private time() {this.get('#query-elapsed').textContent=`경과 ${((this.now()-this.started)/1000).toFixed(1)}초`;}
  start(total:number) {
    this.reset();this.total=total;this.completed=0;this.success=0;this.started=this.now();
    this.root.hidden=false;this.root.dataset.state='running';this.get('#query-phase').textContent='원본에서 잔여석 확인 중';
    const bar=this.get<HTMLProgressElement>('progress');bar.max=total;bar.value=0;
    this.update(0,0);this.time();this.timer=setInterval(()=>this.time(),100);
  }
  update(completed:number,success:number) {
    this.completed=completed;this.success=success;this.get<HTMLProgressElement>('progress').value=completed;
    this.get('#query-counts').textContent=`${completed}/${this.total}척 · ${Math.floor(completed/this.total*100) || 0}% · 성공 ${success} · 실패/미지원 ${completed-success}`;
  }
  finish(outcome:QueryOutcome) {
    if(this.timer!==undefined) clearInterval(this.timer);this.timer=undefined;this.time();
    this.root.dataset.state=outcome==='조회 완료' ? 'complete':'stopped';
    this.get('#query-phase').textContent=outcome;
    this.update(this.completed,this.success);
  }
  reset() {if(this.timer!==undefined) clearInterval(this.timer);this.timer=undefined;this.root.hidden=true;}
}
