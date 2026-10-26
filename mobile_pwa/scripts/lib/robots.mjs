const AGENT='TheFishingAvailability';
/** RFC-style longest matching rule, with specific agent groups taking precedence. */
export function robotsAllows(body,path) {
  const groups=[];
  let group,hasRules=false;
  for(const raw of body.split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(),colon=line.indexOf(':');if(colon<0) continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(key==='user-agent') {
      if(!group || hasRules) {group={agents:[],rules:[]};groups.push(group);hasRules=false;}
      group.agents.push(value.toLowerCase());
    } else if(group) {hasRules=true;if((key==='allow' || key==='disallow') && value) group.rules.push({allow:key==='allow',path:value});}
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*' && AGENT.toLowerCase().includes(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  let length=-1,allow=true;
  for(const rule of selected.flatMap(g=>g.rules)) {
    const pattern=rule.path.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$');
    if(new RegExp('^'+pattern).test(path) && (rule.path.length>length || (rule.path.length===length && rule.allow))) {length=rule.path.length;allow=rule.allow;}
  }
  return allow;
}

