export type QueryOutcome='loading'|'success'|'empty'|'partial'|'error'|'cancelled';
const panels=['region-toggle','search-section','species-toggle'];
export function finishFilterPanels(root:HTMLElement,outcome:QueryOutcome):void {
  root.dataset.queryState=outcome;
  if(outcome==='success' || outcome==='empty') {
    for(const id of panels) {const panel=root.querySelector<HTMLDetailsElement>('#'+id);if(panel) panel.open=false;}
    const focused=document.activeElement;
    if(focused instanceof HTMLElement && focused.closest(panels.map(id=>'#'+id).join(','))) root.querySelector<HTMLButtonElement>('#query-submit')?.focus({preventScroll:true});
  } else if(outcome==='error' || outcome==='partial') {
    const search=root.querySelector<HTMLDetailsElement>('#search-section');if(search) search.open=true;
  }
}
export function installFilterPanels(root:HTMLElement):void {
  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-close-panel]');
    if(!button) return;
    const panel=root.querySelector<HTMLDetailsElement>('#'+button.dataset.closePanel);
    if(panel) {panel.open=false;panel.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}
  });
}
