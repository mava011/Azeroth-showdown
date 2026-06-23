// Azeroth Showdown — walk-cycle sprite-sheet slicer + aligner.
//
// AI sprite sheets are rough: the model gives 3 OR 4 frames, figures drift in size/
// position, and glowing weapons fuse neighbouring figures into one connected blob. So we
// don't rely on blobs. We green-key the sheet, read the COLUMN-COVERAGE profile (a body
// column is opaque head-to-feet; a stray sword-glow column is not), and split it into one
// tall run per figure even when a thin glaive bridges the gap. Each figure gets a window
// (Voronoi-split at the low-coverage valley midpoints), and is rendered onto a common
// canvas at ONE shared scale, alpha-centroid centred, feet on a shared baseline — so the
// frames cycle smoothly. Figures whose BODY run hugs a sheet edge are dropped as cut-off.
// Writes <base>0.png, <base>1.png, ...
//
//   node scripts/slice-walk.mjs public/assets/heroes/illidan_walk.png [--w=440] [--h=620]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/slice-walk.mjs <sheet.png>'); process.exit(1); }
const arg=(k,d)=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?Number(a.split('=')[1]):d; };
const FRAME_H=arg('h',620);                    // FRAME_W is derived per-sheet from the figures
const FIG_H_FRAC=0.98, BASE_FRAC=0.992;        // fill the height & sit feet on the floor, like the static art

const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H, data } = png;
const A=(x,y)=>data[(y*W+x)*4+3];

// 1. green-key
const isGreen=(i)=>{ const r=data[i],g=data[i+1],b=data[i+2]; return g>=135 && r<=145 && b<=145 && (g-r)>=42 && (g-b)>=42; };
for (let p=0;p<W*H;p++){ const i=p*4; if(isGreen(i)) data[i+3]=0; }

// 2. find figures from the column-coverage profile (a body column is opaque ≥1/3 the height)
const colCov = new Float32Array(W);
for (let x=0;x<W;x++){ let c=0; for(let y=0;y<H;y++){ if(A(x,y)>24)c++; } colCov[x]=c; }
const sm = new Float32Array(W), R=3;
for (let x=0;x<W;x++){ let s=0,n=0; for(let k=-R;k<=R;k++){ const xx=x+k; if(xx>=0&&xx<W){s+=colCov[xx];n++;} } sm[x]=s/n; }
const T = H*0.33;
let runs=[], inRun=false, s0=0;
for (let x=0;x<W;x++){
  if (sm[x]>T && !inRun){ inRun=true; s0=x; }
  else if (sm[x]<=T && inRun){ inRun=false; runs.push([s0,x-1]); }
}
if (inRun) runs.push([s0,W-1]);
if (!runs.length){ console.error('no body columns over threshold'); process.exit(1); }
// merge runs separated by only a sliver (a raised arm can briefly dip a column under T)
const widths = runs.map(r=>r[1]-r[0]+1).sort((a,b)=>a-b);
const medW = widths[widths.length>>1];
const merged=[runs[0].slice()];
for (let i=1;i<runs.length;i++){ const prev=merged[merged.length-1];
  if (runs[i][0]-prev[1] < medW*0.4) prev[1]=runs[i][1]; else merged.push(runs[i].slice()); }

// 3. each figure gets a window, split at the emptiest column (coverage valley) in each gap
// — not the midpoint, so a neighbour's blade reaching into the gap stays on its own side.
const splits=[0];
for (let i=1;i<merged.length;i++){ const a=merged[i-1][1], b=merged[i][0];
  let mn=Infinity,mx=Math.round((a+b)/2); for(let x=a;x<=b;x++){ if(sm[x]<mn){ mn=sm[x]; mx=x; } } splits.push(mx); }
splits.push(W-1);
const figs = merged.map((r,i)=>{
  const lo = splits[i], hi = splits[i+1];
  let minX=W,maxX=0,minY=H,maxY=0,sumX=0,nn=0;
  for (let x=lo;x<=hi;x++) for (let y=0;y<H;y++){ if(A(x,y)<=24) continue;
    if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; sumX+=x; nn++; }
  return { runLo:r[0], runHi:r[1], lo, hi, minX, maxX, minY, maxY, cx:sumX/nn, n:nn };
});
// drop figures whose BODY run hugs a sheet edge (the AI cut them off)
const kept = figs.filter(f=> f.n>0 && f.runLo>3 && f.runHi<W-4);
if (!kept.length){ console.error('no complete figures'); process.exit(1); }
const heights = kept.map(f=>f.maxY-f.minY+1).sort((a,b)=>a-b);
const medH = heights[heights.length>>1];
const scale = (FRAME_H*FIG_H_FRAC)/medH;       // one shared scale -> figure fills the height, no pulsing
const baseY = FRAME_H*BASE_FRAC;
// shared frame width from the MEDIAN pose (≈ body width, so it matches the static back view's
// proportions for a seamless swap); a frame with a weapon flung wide just clips the tip a touch
const ws = kept.map(f=>(f.maxX-f.minX+1)*scale).sort((a,b)=>a-b);
const FRAME_W = Math.round(ws[ws.length>>1]*1.08);

// 4. render each figure (masked to its window) onto a normalised frame
const base = file.replace(/\.png$/i,'');
let written=0;
kept.forEach((f)=>{
  const out = new PNG({ width:FRAME_W, height:FRAME_H });
  for (let p=0;p<FRAME_W*FRAME_H;p++) out.data[p*4+3]=0;
  for (let oy=0;oy<FRAME_H;oy++) for (let ox=0;ox<FRAME_W;ox++){
    const sx=Math.round(f.cx + (ox-FRAME_W/2)/scale);
    const sy=Math.round(f.maxY + (oy-baseY)/scale);
    if (sx<f.lo||sx>f.hi||sy<0||sy>=H) continue;     // window mask
    if (A(sx,sy)<=24) continue;
    const si=(sy*W+sx)*4, di=(oy*FRAME_W+ox)*4;
    out.data[di]=data[si]; out.data[di+1]=data[si+1]; out.data[di+2]=data[si+2]; out.data[di+3]=data[si+3];
  }
  // keep only the figure's own component (body+arms+held weapon green-key into ONE blob);
  // a neighbour's weapon clipped across the window midpoint is a SEPARATE blob -> dropped.
  // The body owns the central column band, so keep whichever component dominates it.
  const lab=new Int32Array(FRAME_W*FRAME_H), st=new Int32Array(FRAME_W*FRAME_H);
  let lc=0;
  for (let p0=0;p0<FRAME_W*FRAME_H;p0++){ if(lab[p0]||out.data[p0*4+3]<=24) continue;
    lc++; let sp=0; st[sp++]=p0; lab[p0]=lc;
    while(sp){ const p=st[--sp]; const x=p%FRAME_W;
      const nb=[p-1,p+1,p-FRAME_W,p+FRAME_W];
      if(x===0)nb[0]=-1; if(x===FRAME_W-1)nb[1]=-1;
      for(const q of nb){ if(q<0||q>=FRAME_W*FRAME_H) continue; if(lab[q]||out.data[q*4+3]<=24) continue; lab[q]=lc; st[sp++]=q; } } }
  const cb0=Math.floor(FRAME_W*0.38), cb1=Math.ceil(FRAME_W*0.62), band=new Float64Array(lc+1);
  for (let y=0;y<FRAME_H;y++) for (let x=cb0;x<cb1;x++){ const l=lab[y*FRAME_W+x]; if(l) band[l]++; }
  let B=0,bbest=-1; for (let l=1;l<=lc;l++){ if(band[l]>bbest){ bbest=band[l]; B=l; } }
  if (B) for (let p=0;p<FRAME_W*FRAME_H;p++){ const l=lab[p]; if(l && l!==B) out.data[p*4+3]=0; }
  // despill green fringe
  for (let p=0;p<FRAME_W*FRAME_H;p++){ const i=p*4; if(out.data[i+3]===0) continue;
    const cap=((out.data[i]+out.data[i+2])>>1)+30; if(out.data[i+1]>cap) out.data[i+1]=cap; }
  fs.writeFileSync(base+written+'.png', PNG.sync.write(out));
  written++;
});
console.log(`sliced ${path.basename(file)} -> ${written} frames  figures=${merged.length}  scale=${scale.toFixed(3)}  ${FRAME_W}x${FRAME_H}  aspect=${(FRAME_W/FRAME_H).toFixed(3)}`);
