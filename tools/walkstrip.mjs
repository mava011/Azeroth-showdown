import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { PNG } from 'pngjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
function findChrome(){ const b='/opt/pw-browsers'; for(const d of fs.readdirSync(b)){ if(/^chromium-\d/.test(d)){ const e=path.join(b,d,'chrome-linux','chrome'); if(fs.existsSync(e))return e; } } return ''; }
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)){r.writeHead(404);return r.end('x');}r.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain'});fs.createReadStream(fp).pipe(r);});
const PORT=await new Promise(r=>srv.listen(0,()=>r(srv.address().port)));
const br=await chromium.launch({executablePath:findChrome(),headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']});
const pg=await (await br.newContext({viewport:{width:402,height:874},deviceScaleFactor:2})).newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
const hero=process.argv[2]||'grommash', N=9, GAP=42;
await pg.goto(`http://127.0.0.1:${PORT}/index.html?az=viewtest&hero=${hero}&solo=1`,{waitUntil:'load'});
await pg.waitForFunction(()=>window.AZ&&window.AZ.ready,{timeout:8000}).catch(()=>{});
await pg.waitForTimeout(1500);
const frames=[]; for(let i=0;i<N;i++){ frames.push(PNG.sync.read(await pg.screenshot())); await pg.waitForTimeout(GAP); }
const W=frames[0].width,H=frames[0].height;
const cx0=Math.floor(W*0.30),cx1=Math.floor(W*0.70),cw=cx1-cx0, cy0=Math.floor(H*0.13),cy1=Math.floor(H*0.95),ch=cy1-cy0;
const out=new PNG({width:cw*N,height:ch});
for(let f=0;f<N;f++){ const fr=frames[f];
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ const si=((cy0+y)*W+(cx0+x))*4, di=(y*(cw*N)+(f*cw+x))*4;
    out.data[di]=fr.data[si];out.data[di+1]=fr.data[si+1];out.data[di+2]=fr.data[si+2];out.data[di+3]=255; } }
const o=path.join(ROOT,'tools','shots','walk_'+hero+'.png');
fs.mkdirSync(path.dirname(o),{recursive:true});
fs.writeFileSync(o,PNG.sync.write(out)); console.log('wrote',o,'errors:',errs.slice(0,2).join(' | ')||'none');
await br.close(); srv.close();
