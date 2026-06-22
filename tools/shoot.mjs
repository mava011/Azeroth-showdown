// Azeroth Showdown — visual self-eval harness.
// Serves the real game and screenshots it in headless Chromium (real WebGL2 + PNG
// textures + canvas), so renders match the device. Output: tools/shots/<name>.png
//
// Usage:
//   node tools/shoot.mjs                       # default suite
//   node tools/shoot.mjs preview:illidan       # one hero preview
//   node tools/shoot.mjs battle:illidan,arthas/thrall,jaina   # a battle (me/foe)
//   node tools/shoot.mjs title                 # the menu
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = path.join(ROOT, 'tools', 'shots');
// find the pre-installed Playwright Chromium (version-agnostic), else env override
function findChrome(){
  if(process.env.AZ_CHROME && fs.existsSync(process.env.AZ_CHROME)) return process.env.AZ_CHROME;
  const base='/opt/pw-browsers';
  try{ for(const d of fs.readdirSync(base)){ if(/^chromium-\d/.test(d)){ const e=path.join(base,d,'chrome-linux','chrome'); if(fs.existsSync(e)) return e; } } }catch{}
  return '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
}
const EXE = findChrome();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml'};

fs.mkdirSync(OUT, {recursive:true});

// --- tiny static server rooted at the repo ---
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if(p==='/') p='/index.html';
  const fp = path.join(ROOT, p);
  if(!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()){ res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(fp)]||'application/octet-stream'});
  fs.createReadStream(fp).pipe(res);
});
const PORT = await new Promise(r=> server.listen(0, ()=> r(server.address().port)));
const BASE = `http://127.0.0.1:${PORT}`;

// --- scenarios from CLI, else a default suite ---
function parse(arg){
  if(arg.startsWith('preview:')) return {name:'preview_'+arg.slice(8), url:`/index.html?az=preview&hero=${arg.slice(8)}`, settle:2600};
  if(arg.startsWith('battle:')){ const [me,foe]=arg.slice(7).split('/'); return {name:'battle_'+me.replace(/,/g,'-'), url:`/index.html?az=battle&me=${me}&foe=${foe||'thrall,jaina'}`, settle:3200}; }
  if(arg==='title') return {name:'title', url:`/index.html`, settle:1500};
  return {name:arg.replace(/[^\w]+/g,'_'), url:`/index.html?az=${arg}`, settle:2600};
}
const args = process.argv.slice(2);
const scenes = args.length ? args.map(parse) : [
  {name:'title', url:`/index.html`, settle:1600},
  {name:'preview_illidan', url:`/index.html?az=preview&hero=illidan`, settle:2600},
  {name:'battle_illidan-arthas', url:`/index.html?az=battle&me=illidan,arthas&foe=thrall,jaina`, settle:3400},
];

const browser = await chromium.launch({ executablePath:EXE, headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--mute-audio'] });

for(const s of scenes){
  const ctx = await browser.newContext({ viewport:{width:402,height:874}, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(BASE+s.url, {waitUntil:'load'});
  await page.waitForFunction(()=>window.AZ && window.AZ.ready, {timeout:8000}).catch(()=>{});
  await page.waitForTimeout(s.settle);                 // texture decode + animation settle
  const file = path.join(OUT, s.name+'.png');
  await page.screenshot({ path:file });
  console.log('SHOT', s.name, errs.length?('  ⚠ '+errs.slice(0,2).join(' | ')):'');
  await ctx.close();
}
await browser.close(); server.close();
console.log('done →', path.relative(ROOT,OUT));
