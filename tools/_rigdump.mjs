import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/Azeroth-showdown';
const OUT=path.join(ROOT,'tools','shots','rig'); fs.mkdirSync(OUT,{recursive:true});
function findChrome(){ const base='/opt/pw-browsers';
  for(const d of fs.readdirSync(base)){ if(/^chromium-\d/.test(d)){ const e=path.join(base,d,'chrome-linux','chrome'); if(fs.existsSync(e)) return e; } }
  return '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; }
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); });
const PORT=await new Promise(r=>server.listen(0,()=>r(server.address().port)));
const hero=process.argv[2]||'grommash';
const URL_=`http://127.0.0.1:${PORT}/index.html?az=viewtest&hero=${hero}&solo=1`;
const browser=await chromium.launch({executablePath:findChrome(),headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--mute-audio']});
const ctx=await browser.newContext({viewport:{width:402,height:874}}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.goto(URL_,{waitUntil:'load'});
await pg.waitForFunction(()=>window.AZ&&window.AZ.ready,{timeout:8000}).catch(()=>{});
await pg.waitForTimeout(1400);  // let the rig image load
const N=8;
for(let i=0;i<N;i++){ const gp=i/N*2*Math.PI;
  const url=await pg.evaluate(g=>window.AZ.rigcanvas(g), gp);
  if(!url){ console.log('NULL canvas at',i,'(rig not ready?)'); continue; }
  fs.writeFileSync(path.join(OUT,hero+'_'+String(i).padStart(2,'0')+'.png'), Buffer.from(url.split(',')[1],'base64'));
}
console.log('wrote', N, 'phase frames for', hero);
console.log('errs:', [...new Set(errs)].slice(0,3));
await browser.close(); server.close();
