// Azeroth Showdown — MOTION capture harness.
// Static screenshots can't reveal flashing / view flip-flop / foot-slide / cross-fade ghosting.
// This captures MOTION two ways from the real game in headless Chromium:
//   1) a smooth real-time WebM clip (Playwright recordVideo — no ffmpeg needed) for a HUMAN to watch,
//   2) a DETERMINISTIC fixed-dt PNG frame sequence (drives window.AZ.pause()/step(dt)) for tools/motioneval.mjs.
// Output: tools/shots/motion/<scenario>/clip.webm + frame_000.png … frame_NNN.png
//
// Usage:
//   node tools/motioncap.mjs walk:grommash            # lone walker (gait QA: stride, foot-slide, ghosting)
//   node tools/motioncap.mjs battle:illidan,arthas/thrall,jaina   # real combat (flashing / flip-flop / z-fight)
//   node tools/motioncap.mjs attack:grommash          # attack demo vs a dummy
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function findChrome(){
  if(process.env.AZ_CHROME && fs.existsSync(process.env.AZ_CHROME)) return process.env.AZ_CHROME;
  const base='/opt/pw-browsers';
  try{ for(const d of fs.readdirSync(base)){ if(/^chromium-\d/.test(d)){ const e=path.join(base,d,'chrome-linux','chrome'); if(fs.existsSync(e)) return e; } } }catch{}
  return '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
}
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};

// scenario string -> { name, url }
function parse(arg){
  if(arg.startsWith('walk:'))   return { name:'walk_'+arg.slice(5),   url:`/index.html?az=viewtest&hero=${arg.slice(5)}&solo=1` };
  if(arg.startsWith('walkfront:')) return { name:'walkfront_'+arg.slice(10), url:`/index.html?az=viewtest&hero=${arg.slice(10)}&solo=3` };
  if(arg.startsWith('walkside:'))  return { name:'walkside_'+arg.slice(9),  url:`/index.html?az=viewtest&hero=${arg.slice(9)}&solo=4` };
  if(arg.startsWith('attack:')) return { name:'attack_'+arg.slice(7), url:`/index.html?az=viewtest&hero=${arg.slice(7)}&solo=2` };
  if(arg.startsWith('battle:')){ const [me,foe]=arg.slice(7).split('/');
    return { name:'battle_'+me.replace(/,/g,'-'), url:`/index.html?az=battle&me=${me}&foe=${foe||'thrall,jaina'}` }; }
  return { name:arg.replace(/[^\w]+/g,'_'), url:`/index.html?az=${arg}` };
}

const arg = process.argv[2] || 'walk:grommash';
const N   = +(process.argv[3]) || 48;        // deterministic frames
const DT  = 1/30;                            // fixed game-time step per frame
const WARMUP = +(process.env.AZ_WARMUP)||0;  // game-seconds to fast-forward before capturing (reach the melee in a battle)
const scene = parse(arg);
const OUT = path.join(ROOT, 'tools', 'shots', 'motion', scene.name);
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });

// --- tiny static server rooted at the repo (same as walkstrip/shoot) ---
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if(p==='/') p='/index.html';
  const fp = path.join(ROOT, p);
  if(!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()){ res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(fp)]||'application/octet-stream'});
  fs.createReadStream(fp).pipe(res);
});
const PORT = await new Promise(r=> server.listen(0, ()=> r(server.address().port)));
const URL_ = `http://127.0.0.1:${PORT}${scene.url}`;
const VIEW = { width:402, height:874 };

const browser = await chromium.launch({ executablePath:findChrome(), headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--mute-audio'] });

const ready = pg => pg.waitForFunction(()=>window.AZ&&window.AZ.ready,{timeout:8000}).catch(()=>{});
const errs=[];

// ---------- Phase A: smooth real-time WebM clip for a human to watch ----------
{
  const ctx = await browser.newContext({ viewport:VIEW, deviceScaleFactor:1,
    recordVideo:{ dir:OUT, size:VIEW } });
  const pg = await ctx.newPage(); pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(URL_, { waitUntil:'load' }); await ready(pg);
  await pg.waitForTimeout(1300);                                   // texture decode + settle
  if(WARMUP>0) await pg.waitForTimeout(WARMUP*1000);              // run at 1x to reach the melee phase
  await pg.evaluate(()=>window.AZ.slowmo&&window.AZ.slowmo(0.5));  // half-speed: motion is easy to judge by eye
  await pg.waitForTimeout(3600);                                   // ~1.8s of game time
  const vid = pg.video();
  await ctx.close();                                              // finalizes the .webm
  try{ const vp = await vid.path(); fs.renameSync(vp, path.join(OUT,'clip.webm')); }catch(e){ console.warn('webm save failed:', e.message); }
}

// ---------- Phase B: deterministic fixed-dt frames for metrics + motion-encoded stills ----------
{
  const ctx = await browser.newContext({ viewport:VIEW, deviceScaleFactor:1 });
  const pg = await ctx.newPage(); pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(URL_, { waitUntil:'load' }); await ready(pg);
  await pg.waitForTimeout(1300);
  await pg.evaluate(()=>window.AZ.pause&&window.AZ.pause());
  if(WARMUP>0) await pg.evaluate(({dt,n})=>{ for(let i=0;i<n;i++) window.AZ.step&&window.AZ.step(dt); }, {dt:DT, n:Math.round(WARMUP/DT)}); // fast-forward (deterministic, one round-trip) into the melee
  for(let i=0;i<N;i++){
    await pg.evaluate(dt=>window.AZ.step&&window.AZ.step(dt), DT);
    // let the stepped frame render (two rAFs: one to consume the step, one to present)
    await pg.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const buf = await pg.screenshot();
    fs.writeFileSync(path.join(OUT,'frame_'+String(i).padStart(3,'0')+'.png'), buf);
  }
  await ctx.close();
}

await browser.close(); server.close();
const uniq=[...new Set(errs)].slice(0,3);
console.log('MOTION', scene.name, '->', path.relative(ROOT,OUT), `(${N} frames @ dt=${DT.toFixed(3)} + clip.webm)`,
  uniq.length?('  ⚠ '+uniq.join(' | ')):'');
