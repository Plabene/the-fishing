const controls='button,input,select,textarea,a[href],summary,[tabindex]';

/** Logical keys survive node replacement; never match boats by name. */
function key(node:HTMLElement):string {
  if(node.id) return `id:${node.id}`;
  if(node.dataset.focusKey) return `key:${node.dataset.focusKey}`;
  for(const field of ['tier','platform','date','speciesChoice','species','regionField'] as const) if(node.dataset[field]) return `${field}:${node.dataset[field]}`;
  if(node.dataset.regionChoice) return `region:${node.dataset.regionChoice}:${(node as HTMLInputElement).value}`;
  if(node.tagName==='SUMMARY') return `summary:${node.parentElement?key(node.parentElement):''}`;
  const owner=node.closest<HTMLElement>('[data-uid],[id]');
  const context=owner?.dataset.uid || owner?.id || '';
  return `${context}:${node.tagName}:${node.getAttribute('name') || node.getAttribute('href') || node.getAttribute('aria-label') || node.textContent}`;
}
export function canFocus(node:HTMLElement|null|undefined):node is HTMLElement {
  if(!node?.isConnected || node.matches(':disabled,[aria-disabled=true]')) return false;
  for(let parent:HTMLElement|null=node;parent;parent=parent.parentElement) {
    if(parent.hidden || parent.hasAttribute('inert')) return false;
    const style=getComputedStyle(parent);if(style.display==='none' || style.visibility==='hidden') return false;
    if(parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope>summary')?.contains(node)) return false;
  }
  return true;
}
/** Restore only if rendering/temporary disabling lost focus, not after the user moved elsewhere. */
export function retainFocus(root:HTMLElement,fallback?:()=>HTMLElement|null) {
  const original=document.activeElement instanceof HTMLElement && root.contains(document.activeElement)?document.activeElement:null;
  const identity=original?key(original):'';
  return ()=>{
    if(!original) return;
    const current=document.activeElement;
    if(current!==original && current!==document.body && current!==document.documentElement) return;
    const replacement=original.isConnected?original:[...root.querySelectorAll<HTMLElement>(controls)].find(node=>key(node)===identity);
    const destination=canFocus(replacement)?replacement:fallback?.();
    if(canFocus(destination) && destination!==document.activeElement) destination.focus({preventScroll:true});
  };
}
/** Component-local disclosure state, including focus on native summaries. */
export function retainDisclosureUi(root:HTMLElement,fallback?:()=>HTMLElement|null) {
  const restoreFocus=retainFocus(root,fallback);
  const opened=new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(node=>key(node)));
  return ()=>{for(const node of root.querySelectorAll<HTMLDetailsElement>('details')) if(opened.has(key(node))) node.open=true;restoreFocus();};
}
