import { readFile, readdir } from 'node:fs/promises';
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes("connect-src 'self'")) throw new Error('Missing same-origin connection policy');
for (const name of await readdir('dist/assets')) {
  if (!name.endsWith('.js')) continue;
  const source = await readFile(`dist/assets/${name}`, 'utf8');
  if (/fetch\s*\(|XMLHttpRequest|WebSocket/.test(source)) throw new Error('Unexpected live-collection transport');
}
console.log('offline_bundle_audit=passed');
