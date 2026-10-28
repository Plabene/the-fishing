import {parseHTML} from 'linkedom';
const reserved=new Set(['www','api','service','app','img','images','static','cdn','admin']);
export function publicCandidateHost(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && /^[a-z0-9-]+\.sunsang24\.com$/.test(u.hostname) && !reserved.has(u.hostname.split('.')[0]) ? u.hostname : null;
  } catch {return null;}
}
/** Discovery evidence only. A linked host is never automatically trusted or fetched. */
export function discoverPublicHosts(html,originHost) {
  const doc=parseHTML(html).document,hosts=new Set();
  for(const anchor of doc.querySelectorAll('a[href]')) {
    let url;try {url=new URL(anchor.getAttribute('href'),`https://${originHost}/`);} catch {continue;}
    if(!/^\/(?:$|ship\/(?:schedule_fleet|info)(?:\/|$))/.test(url.pathname)) continue;
    const host=publicCandidateHost(url.href);if(host && host!==originHost) hosts.add(host);
  }
  return [...hosts].sort();
}
