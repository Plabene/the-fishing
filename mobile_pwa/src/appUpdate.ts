export const APP_RELEASE='2026.10.26.1';
/** Offer an explicit reload, preserving in-progress queries, form edits and local boat settings. */
export async function watchAppUpdates(container:ServiceWorkerContainer,base:string,onReady:()=>void) {
  let controlled=!!container.controller;
  container.addEventListener('controllerchange',()=>{if(controlled) onReady();controlled=true;});
  const registration=await container.register(`${base}sw.js`,{updateViaCache:'none'});
  const watch=(worker:ServiceWorker|null)=>worker?.addEventListener('statechange',()=>{if(worker.state==='activated' && controlled) onReady();});
  watch(registration.installing);
  registration.addEventListener('updatefound',()=>watch(registration.installing));
  await registration.update();
  return registration;
}
