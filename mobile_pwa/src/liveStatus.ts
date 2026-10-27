/** A single polite channel; elapsed-time ticks and every response stay visual only. */
export class LiveStatus {
  private timer:ReturnType<typeof setTimeout>|undefined;
  private last=-Infinity;
  private pending='';
  constructor(private node:HTMLElement,private now=()=>performance.now()) {}
  private write(value:string) {if(this.node.textContent!==value) this.node.textContent=value;this.last=this.now();}
  say(value:string) {if(this.timer!==undefined) clearTimeout(this.timer);this.timer=undefined;this.pending='';this.write(value);}
  progress(value:string) {
    this.pending=value;
    if(this.timer!==undefined) return;
    const wait=Math.max(0,1500-(this.now()-this.last));
    if(!wait) {this.write(value);return;}
    this.timer=setTimeout(()=>{this.timer=undefined;this.write(this.pending);},wait);
  }
}
