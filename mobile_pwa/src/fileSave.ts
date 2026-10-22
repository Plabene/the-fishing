export function canShareJson():boolean {
  try {return typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[new File(['{}'],'tiers.json',{type:'application/json'})]});}
  catch {return false;}
}
export async function saveJsonFile(content:string,prefix:string,share=false):Promise<'download'|'shared'|'cancelled'> {
  const name=`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const file=new File([content],name,{type:'application/json'});
  if(share && canShareJson()) {
    try {await navigator.share({files:[file],title:'선박 티어 백업'});return 'shared';}
    catch(error) {if(error && typeof error==='object' && 'name' in error && error.name==='AbortError') return 'cancelled';throw error;}
  }
  const url=URL.createObjectURL(file),link=document.createElement('a');
  link.href=url;link.download=name;link.hidden=true;document.body.append(link);
  try {link.click();} finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  return 'download';
}
