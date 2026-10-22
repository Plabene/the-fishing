import { readFile, readdir } from 'node:fs/promises';
const html = await readFile('dist/index.html', 'utf8');
const allowed="connect-src 'self' https://*.workers.dev https://thefishing.kr/reservation/list.php https://thefishing.kr/reservation/list.view.view.1.ajax.php https://thefishing.kr/reservation/list.view.view.1.ajax.new.php;";
if (!html.includes(allowed)) throw new Error('Unexpected connection policy');
for (const name of await readdir('dist/assets')) {
  if (!name.endsWith('.js')) continue;
  const source = await readFile(`dist/assets/${name}`, 'utf8');
  if (/KHOA_TIDE_API_KEY|serviceKey/.test(source)) throw new Error('Tide credentials must stay on the server');
  if (/new\s+XMLHttpRequest|new\s+WebSocket|mode:["']no-cors["']|credentials:["']include["']/.test(source)) throw new Error('Unexpected transport or credential mode');
}
const worker=await readFile('dist/sw.js','utf8');
if(!worker.includes('url.origin !== self.location.origin')) throw new Error('Remote responses must not enter the app-shell cache');
console.log('direct_query_bundle_audit=passed');
