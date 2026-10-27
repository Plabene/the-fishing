export type QueryOutcome='loading'|'success'|'empty'|'partial'|'error'|'cancelled';
const panels=['region-toggle','species-toggle'];
export function finishFilterPanels(root:HTMLElement,outcome:QueryOutcome):void {
  root.dataset.queryState=outcome;
  if(outcome==='success' || outcome==='empty') {
    // Native details closing may blur its descendant. Capture the owner before closing.
    const focused=document.activeElement;
    const returnFocus=focused instanceof HTMLElement && !!focused.closest(panels.map(id=>'#'+id).join(','));
    for(const id of panels) {const panel=root.querySelector<HTMLDetailsElement>('#'+id);if(panel) panel.open=false;}
    if(returnFocus) {
      const submit=root.querySelector<HTMLButtonElement>('#query-submit');
      const destination=submit && !submit.disabled && !submit.hidden?submit:root.querySelector<HTMLElement>('#region-toggle>summary');
      destination?.focus({preventScroll:true});
    }
  } else if(outcome==='error' || outcome==='partial') {
    const region=root.querySelector<HTMLDetailsElement>('#region-toggle');if(region) region.open=true;
  }
}
export function installFilterPanels(root:HTMLElement):void {
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || event.defaultPrevented) return;
    const panel=(event.target as HTMLElement).closest<HTMLDetailsElement>('details[open]');
    if(!panel || !root.contains(panel)) return;
    event.preventDefault();event.stopPropagation();panel.open=false;panel.querySelector<HTMLElement>(':scope>summary')?.focus({preventScroll:true});
  });
  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-close-panel]');
    if(!button) return;
    const panel=root.querySelector<HTMLDetailsElement>('#'+button.dataset.closePanel);
    if(panel) {panel.open=false;panel.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}
  });
}
