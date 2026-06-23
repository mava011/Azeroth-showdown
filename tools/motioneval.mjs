// Azeroth Showdown — MOTION evaluator (pure Node + pngjs; no ffmpeg/python needed).
// Reads the deterministic frame sequence captured by tools/motioncap.mjs and turns MOTION into:
//   • objective metrics  : per-frame MAD, luminance flicker-index, centroid jerk, foot-slide proxy
//   • a PASS/FLAG verdict : against research thresholds (flicker-index >0.016 = visible flash, etc.)
//   • motion-encoded STILLS I can actually view:
//       onion.png        — ~8 frames averaged (multi-exposure): static body stays sharp, moving limbs ghost into arcs
//       heatmap_var.png  — per-pixel temporal variance: bright = WHERE it moves/flashes
//       heatmap_diff.png — the single worst consecutive-frame difference: localizes the pop
//       strip.png        — contact sheet of evenly-spaced frames
//
// Usage:  node tools/motioneval.mjs walk_grommash        (a folder name under tools/shots/motion/)
//         node tools/motioneval.mjs battle_illidan-arthas
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2] || 'walk_grommash';
const DIR  = path.isAbsolute(name) ? name : path.join(ROOT,'tools','shots','motion', name);
const files = fs.readdirSync(DIR).filter(f=>/^frame_\d+\.png$/.test(f)).sort();
if(files.length<3){ console.error('need >=3 frames in', DIR); process.exit(1); }

// Region of interest: focus on the figure(s), trim HUD/edges. Battles span wider than a lone walker.
const isBattle = /^battle/.test(name);
const ROI = isBattle ? {x0:0.08,x1:0.92,y0:0.10,y1:0.96} : {x0:0.28,x1:0.72,y0:0.12,y1:0.97};

// ---- load frames, cropped to the ROI; keep RGBA + a luma plane per frame ----
const frames=[]; let W=0,H=0;
for(const f of files){
  const png = PNG.sync.read(fs.readFileSync(path.join(DIR,f)));
  const x0=(png.width *ROI.x0)|0, x1=(png.width *ROI.x1)|0;
  const y0=(png.height*ROI.y0)|0, y1=(png.height*ROI.y1)|0;
  const w=x1-x0, h=y1-y0; W=w; H=h;
  const rgba=Buffer.alloc(w*h*4), luma=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const si=((y0+y)*png.width+(x0+x))*4, di=(y*w+x)*4;
    const r=png.data[si], g=png.data[si+1], b=png.data[si+2];
    rgba[di]=r; rgba[di+1]=g; rgba[di+2]=b; rgba[di+3]=255;
    luma[y*w+x]=0.299*r+0.587*g+0.114*b;
  }
  frames.push({rgba,luma});
}
const NF=frames.length, NP=W*H;

// ---- background estimate = per-pixel MEDIAN luma across the sequence (stable bg, movers stand out) ----
const bg=new Float32Array(NP), col=new Float32Array(NF);
for(let p=0;p<NP;p++){ for(let i=0;i<NF;i++) col[i]=frames[i].luma[p]; col.sort(); bg[p]=col[(NF/2)|0]; }
// foreground mask per frame: pixel notably brighter/different than its background median
const FG_T=26;                                   // luma delta to count as "figure", not background
function fgAt(i,p){ return Math.abs(frames[i].luma[p]-bg[p])>FG_T; }

// ---- (1) per consecutive-frame MAD (luma) + (2) frame mean luma for the flicker-index ----
const mad=new Float32Array(NF-1), meanL=new Float32Array(NF);
for(let i=0;i<NF;i++){ let s=0; const L=frames[i].luma; for(let p=0;p<NP;p++) s+=L[p]; meanL[i]=s/NP; }
for(let i=0;i<NF-1;i++){ let s=0; const A=frames[i].luma,B=frames[i+1].luma; for(let p=0;p<NP;p++) s+=Math.abs(A[p]-B[p]); mad[i]=s/NP; }
// flicker-index (IEEE-1789 flavour): mean over frames of |ΔmeanL|/meanL̄, plus the worst single jump
let Lavg=0; for(let i=0;i<NF;i++) Lavg+=meanL[i]; Lavg/=NF;
let fiSum=0, fiMax=0; for(let i=0;i<NF-1;i++){ const d=Math.abs(meanL[i+1]-meanL[i])/(Lavg||1); fiSum+=d; if(d>fiMax)fiMax=d; }
const flickerIndex=fiSum/(NF-1);
// MAD spikes = a texture pop / flash (well above the running median)
const madSorted=[...mad].sort((a,b)=>a-b), madMed=madSorted[(madSorted.length/2)|0]||0.0001;
const popFrames=[]; for(let i=0;i<mad.length;i++) if(mad[i]>Math.max(8, madMed*2.5)) popFrames.push({i,mad:+mad[i].toFixed(1),x:(mad[i]/madMed).toFixed(1)});

// ---- (1b) LOCALIZED flash: a single unit's view-flip / texture-swap / mirror changes one big
// region while the whole-frame mean stays flat (so flicker-index misses it in a battle). Tile the
// ROI and track the WORST tile's consecutive-frame MAD — that spikes hard on a per-unit flash. ----
const TILE=48, TX=Math.max(1,(W/TILE)|0), TY=Math.max(1,(H/TILE)|0);
const locMad=new Float32Array(NF-1);
for(let i=0;i<NF-1;i++){ const A=frames[i].luma,B=frames[i+1].luma; let best=0;
  for(let ty=0;ty<TY;ty++) for(let tx=0;tx<TX;tx++){ let s=0,c=0;
    const x0=tx*TILE,x1=Math.min(W,x0+TILE),y0=ty*TILE,y1=Math.min(H,y0+TILE);
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const p=y*W+x; s+=Math.abs(A[p]-B[p]); c++; }
    const m=s/c; if(m>best) best=m; }
  locMad[i]=best; }
const locSorted=[...locMad].sort((a,b)=>a-b), locMed=locSorted[(locSorted.length/2)|0]||0.01, locMax=Math.max(...locMad);
// a FLASH is a transient 1-frame spike vs its neighbours (sustained motion is high but smooth)
const locPops=[]; for(let i=1;i<locMad.length-1;i++){ const nb=Math.max(locMad[i-1],locMad[i+1]);
  if(locMad[i]>30 && locMad[i]>1.8*nb) locPops.push(i); }

// ---- (3) figure centroid per frame -> velocity/accel/jerk (jerk spikes = inconsistent movement) ----
const cx=new Float32Array(NF), cy=new Float32Array(NF), footx=new Float32Array(NF);
const footY0=(H*0.80)|0;                          // bottom ~20% band = the feet
for(let i=0;i<NF;i++){
  let sx=0,sy=0,n=0, fsx=0,fn=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const p=y*W+x; if(fgAt(i,p)){ sx+=x; sy+=y; n++; if(y>=footY0){ fsx+=x; fn++; } } }
  cx[i]=n?sx/n:cx[i-1]||W/2; cy[i]=n?sy/n:cy[i-1]||H/2; footx[i]=fn?fsx/fn:footx[i-1]||W/2;
}
function deriv(a){ const d=new Float32Array(a.length-1); for(let i=0;i<d.length;i++) d[i]=a[i+1]-a[i]; return d; }
const vx=deriv(cx), vy=deriv(cy), ax=deriv(vx), ay=deriv(vy), jx=deriv(ax), jy=deriv(ay);
let jerk=0; for(let i=0;i<jx.length;i++) jerk+=Math.hypot(jx[i],jy[i]); jerk/=Math.max(1,jx.length);
// foot-slide proxy: lateral wander of the foot band, as a fraction of figure width
let fmin=1e9,fmax=-1e9; for(let i=0;i<NF;i++){ if(footx[i]<fmin)fmin=footx[i]; if(footx[i]>fmax)fmax=footx[i]; }
let figW=0; { let xmin=1e9,xmax=-1e9; for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(fgAt((NF/2)|0,y*W+x)){ if(x<xmin)xmin=x; if(x>xmax)xmax=x; } figW=Math.max(1,xmax-xmin); }
const footSlide=(fmax-fmin)/figW;                 // 0 = planted; large = sliding/swinging

// ---- motion-encoded STILLS ----
function writePNG(file,w,h,data){ const o=new PNG({width:w,height:h}); o.data=data; fs.writeFileSync(path.join(DIR,file),PNG.sync.write(o)); }
function jet(t){ t=Math.max(0,Math.min(1,t)); return [ (1.5-Math.abs(4*t-3))*255, (1.5-Math.abs(4*t-2))*255, (1.5-Math.abs(4*t-1))*255 ].map(v=>Math.max(0,Math.min(255,v))); }
// onion: average ~8 evenly spaced frames (multi-exposure)
{ const K=Math.min(8,NF), out=Buffer.alloc(NP*4);
  const idx=[]; for(let k=0;k<K;k++) idx.push(Math.round(k*(NF-1)/(K-1)));
  for(let p=0;p<NP;p++){ let r=0,g=0,b=0; for(const i of idx){ r+=frames[i].rgba[p*4]; g+=frames[i].rgba[p*4+1]; b+=frames[i].rgba[p*4+2]; }
    out[p*4]=r/K; out[p*4+1]=g/K; out[p*4+2]=b/K; out[p*4+3]=255; }
  writePNG('onion.png',W,H,out); }
// temporal-variance heatmap (per-pixel luma variance -> jet)
{ const varr=new Float32Array(NP); let vmax=1e-6;
  for(let p=0;p<NP;p++){ let m=0; for(let i=0;i<NF;i++) m+=frames[i].luma[p]; m/=NF; let v=0; for(let i=0;i<NF;i++){ const d=frames[i].luma[p]-m; v+=d*d; } v/=NF; varr[p]=v; if(v>vmax)vmax=v; }
  const out=Buffer.alloc(NP*4); for(let p=0;p<NP;p++){ const [r,g,b]=jet(Math.sqrt(varr[p]/vmax)); out[p*4]=r; out[p*4+1]=g; out[p*4+2]=b; out[p*4+3]=255; }
  writePNG('heatmap_var.png',W,H,out); }
// worst consecutive-frame diff heatmap — use the worst LOCALIZED frame (shows where a unit flashed)
{ let wi=0; for(let i=1;i<locMad.length;i++) if(locMad[i]>locMad[wi]) wi=i;
  const A=frames[wi].luma,B=frames[wi+1].luma, out=Buffer.alloc(NP*4);
  for(let p=0;p<NP;p++){ const [r,g,b]=jet(Math.min(1,Math.abs(A[p]-B[p])/64)); out[p*4]=r; out[p*4+1]=g; out[p*4+2]=b; out[p*4+3]=255; }
  writePNG('heatmap_diff.png',W,H,out); }
// contact strip: evenly spaced frames tiled horizontally
{ const K=Math.min(9,NF), idx=[]; for(let k=0;k<K;k++) idx.push(Math.round(k*(NF-1)/(K-1)));
  const out=Buffer.alloc(W*K*H*4);
  for(let c=0;c<K;c++){ const fr=frames[idx[c]].rgba; for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const si=(y*W+x)*4, di=(y*(W*K)+(c*W+x))*4; out[di]=fr[si]; out[di+1]=fr[si+1]; out[di+2]=fr[si+2]; out[di+3]=255; } }
  writePNG('strip.png',W*K,H,out); }

// ---- verdict ----
const flags=[];
if(flickerIndex>0.016 || fiMax>0.06) flags.push(`FLICKER (index ${flickerIndex.toFixed(4)}, worst jump ${fiMax.toFixed(3)})`);
if(popFrames.length)                 flags.push(`POPS x${popFrames.length} @ frames ${popFrames.slice(0,6).map(p=>p.i).join(',')}`);
if(locPops.length)                   flags.push(`LOCAL-FLASH x${locPops.length} @ frames ${locPops.slice(0,6).join(',')} (per-unit view-flip/swap)`);
// NOTE: foot-slide below is informational only — it's the centroid of CHANGING foot pixels, which
// swings with normal leg alternation on an in-place walker (a weak proxy). Real foot-skate needs a
// translating unit (body-speed vs foot-speed); not flagged here to avoid false positives.
const grade = flags.length? 'FLAG' : 'PASS';

const F=(n,d=4)=>(+n).toFixed(d);
console.log(`\n=== motioneval: ${name}  (${NF} frames, ROI ${W}x${H}) ===`);
console.log(` flicker-index : ${F(flickerIndex)}   (good<0.008  ok<0.016  bad>0.016)   worst frame jump ${F(fiMax,3)}`);
console.log(` MAD (luma)    : median ${F(madMed,2)}  max ${F(Math.max(...mad),2)}   pops>2.5x: ${popFrames.length}`);
console.log(` local-flash   : worst-tile MAD ${F(locMax,1)}  median ${F(locMed,1)}   localized pops: ${locPops.length}${locPops.length?'  @ '+locPops.slice(0,8).join(','):''}`);
console.log(` centroid jerk : ${F(jerk,3)} px/frame^3   (lower = smoother)`);
console.log(` foot-swing    : ${F(footSlide,3)} of figW  (info only — changing-foot-pixel centroid; high = big leg alternation, not necessarily skating)`);
if(popFrames.length) console.log(` pop frames    : ${popFrames.slice(0,8).map(p=>`#${p.i}(${p.x}x)`).join(' ')}`);
console.log(` stills        : onion.png  heatmap_var.png  heatmap_diff.png  strip.png  (in ${path.relative(ROOT,DIR)})`);
console.log(` VERDICT       : ${grade}${flags.length?'  — '+flags.join('  |  '):''}\n`);
