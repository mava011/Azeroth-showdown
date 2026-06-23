// Azeroth Showdown — FLIP probe. The "flashing" the player sees is mostly units rapidly switching
// view (front/side/back) or mirror-flipping (faceSign) when targets jostle near a threshold. Pixel
// metrics dilute that in a battle; this measures it DIRECTLY by reading the per-unit flip counters
// exposed in AZ.dbg() over a real-time run. Lower = calmer. Usage:
//   node tools/flipprobe.mjs                       # default melee
//   node tools/flipprobe.mjs illidan,arthas,uther/thrall,jaina,rexxar 6
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function findChrome(){ if(process.env.AZ_CHROME&&fs.existsSync(process.env.AZ_CHROME))return process.env.AZ_CHROME;
  const b='/opt/pw-browsers'; try{ for(const d of fs.readdirSync(b)){ if(/^chromium-\d/.test(d)){ const e=path.join(b,d,'chrome-linux','chrome'); if(fs.existsSync(e))return e; } } }catch{} return ''; }
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r.writeHead(404);return r.end('x');}r.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain'});fs.createReadStream(fp).pipe(r);});
const PORT=await new Promise(r=>srv.listen(0,()=>r(srv.address().port)));

const matchup=(process.argv[2]||'illidan,arthas,uther/thrall,jaina,grommash');
const SECS=+(process.argv[3])||6;
const [me,foe]=matchup.split('/');
const br=await chromium.launch({executablePath:findChrome(),headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']});
const pg=await (await br.newContext({viewport:{width:402,height:874},deviceScaleFactor:2})).newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.goto(`http://127.0.0.1:${PORT}/index.html?az=battle&me=${me}&foe=${foe}`,{waitUntil:'load'});
await pg.waitForFunction(()=>window.AZ&&window.AZ.ready,{timeout:8000}).catch(()=>{});
await pg.waitForTimeout(700);                               // let units spawn & start marching

const t0=Date.now();
await pg.waitForTimeout(SECS*1000);                         // real-time battle
const elapsed=(Date.now()-t0)/1000;
const dbg=await pg.evaluate(()=>window.AZ.dbg());

let totV=0,totF=0,n=0,worst={vf:0,ff:0,id:'-'};
for(const u of dbg.units){ totV+=u.vf; totF+=u.ff; n++; if(u.vf+u.ff > worst.vf+worst.ff) worst={vf:u.vf,ff:u.ff,id:u.id}; }
console.log(`\n=== flipprobe: ${matchup}  (${elapsed.toFixed(1)}s real-time, ${n} units${dbg.ended?', battle ended':''}) ===`);
console.log(` view-flips : total ${totV}   = ${(totV/elapsed/Math.max(1,n)).toFixed(2)} per unit/sec`);
console.log(` face-flips : total ${totF}   = ${(totF/elapsed/Math.max(1,n)).toFixed(2)} per unit/sec`);
console.log(` worst unit : ${worst.id}  (view ${worst.vf}, face ${worst.ff})`);
console.log(` per-unit   : ${dbg.units.map(u=>`${u.id}[v${u.vf} f${u.ff}]`).join(' ')}`);
console.log(` (calm target: < ~1 view-flip and < ~1 face-flip per unit/sec)`, errs.length?('  ⚠ '+errs.slice(0,2).join(' | ')):'','\n');
await br.close(); srv.close();
