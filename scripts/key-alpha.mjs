// Azeroth Showdown — alpha keyer for generated sprite/structure PNGs.
//
// gpt-image-1 returns three kinds of output for a "transparent" request:
//   (a) a true cutout (border already alpha~0) — just erode the fringe + crop;
//   (b) a baked solid/gradient background (border opaque) — flood-fill it out by colour;
//   (c) a lime-green screen when generated with `--flat` — green-key it (deterministic,
//       robust even for green-skinned orcs because the key only catches near-pure lime).
// We auto-detect (a) vs (b) from the border opacity; (c) is opt-in via --green. Always
// verify the result over magenta with scripts/preview-cutout.mjs before shipping.
//
// Usage:
//   node scripts/key-alpha.mjs <file.png> [--out=path] [--tol=42] [--erode=1]
//        [--crop-only]   already transparent: only crop to the alpha bbox
//        [--green]       key out a flat lime-green (#00ff00) screen
//        [--baked|--no-baked]  force/disable colour-match flood-fill
//        [--chroma|--no-chroma]  force/disable the white/grey chroma key
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node scripts/key-alpha.mjs <file.png> [--out=path] ...'); process.exit(1); }
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
const has = (k) => args.includes('--' + k);

const TOL   = opt('tol', 42);      // flood-fill colour distance from the sampled bg (per-channel sum)
const WHITE = opt('white', 232);   // chroma key: min brightness to count as background white/grey
const SAT   = opt('sat', 26);      // chroma key: max (maxCh-minCh) to count as neutral grey
const ERODE = opt('erode', 1);     // px of alpha edge to erode (kills the fringe halo)
const CROP  = !has('no-crop');
const OUT   = (args.find(a => a.startsWith('--out=')) || '').split('=')[1] || file;

const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H, data } = png;        // RGBA, 4 bytes/px
const idx = (x, y) => (y * W + x) * 4;

// ---------- helpers ----------
function erodeEdge() {
  for (let e = 0; e < ERODE; e++) {
    const kill = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y); if (data[i + 3] === 0) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || data[idx(nx, ny) + 3] === 0) { kill.push(i); break; }
      }
    }
    for (const i of kill) data[i + 3] = 0;
  }
}
function report(mode, tags, bgRep) {
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[idx(x, y) + 3] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  let outBuf = png, outW = W, outH = H;
  if (CROP && maxX >= minX && maxY >= minY) {
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    outW = maxX - minX + 1; outH = maxY - minY + 1;
    const c = new PNG({ width: outW, height: outH });
    for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
      const s = idx(minX + x, minY + y), d = (y * outW + x) * 4;
      c.data[d] = data[s]; c.data[d+1] = data[s+1]; c.data[d+2] = data[s+2]; c.data[d+3] = data[s+3];
    }
    outBuf = c;
  }
  let opaque = 0; for (let p = 0; p < outW * outH; p++) if (outBuf.data[p*4+3] > 8) opaque++;
  fs.writeFileSync(OUT, PNG.sync.write(outBuf));
  console.log(`${mode} ${path.basename(file)}  bg≈rgb(${bgRep.join(',')})${tags}  ${W}x${H} -> ${outW}x${outH}  opaque=${(100*opaque/(outW*outH)).toFixed(1)}%  aspect=${(outW/outH).toFixed(3)} -> ${OUT}`);
}

// ---------- mode: crop-only (already a clean cutout) ----------
if (has('crop-only')) { report('CROP ', '', [0,0,0]); process.exit(0); }

// ---------- mode: green-screen (--flat generations) ----------
if (has('green')) {
  // near-pure lime only, so green-skinned orcs survive; despill the remaining edge tint
  const isGreen = (i) => { const r=data[i], g=data[i+1], b=data[i+2]; return g >= 150 && r <= 135 && b <= 135 && (g - r) >= 55 && (g - b) >= 55; };
  for (let p = 0; p < W * H; p++) { const i = p * 4; if (isGreen(i)) data[i + 3] = 0; }
  erodeEdge();
  // despill ONLY the silhouette edge (pixels touching transparency) — a global pass would
  // dull green-skinned orcs / green nature FX. Cap green to a touch above the red/blue mean.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (data[i + 3] === 0) continue;
    let edge = false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx=x+dx, ny=y+dy; if (nx<0||nx>=W||ny<0||ny>=H||data[idx(nx,ny)+3]===0){ edge=true; break; } }
    if (!edge) continue;
    const cap = ((data[i] + data[i + 2]) >> 1) + 30; if (data[i + 1] > cap) data[i + 1] = cap;
  }
  report('GREEN', '', [0,255,0]); process.exit(0);
}

// ---------- modes: auto cutout / baked ----------
// sample border opacity + (from opaque pixels) the baked bg colour
let borderOpaque = 0, borderN = 0;
const opaqueSamples = [];
for (let x = 0; x < W; x += Math.max(1, (W / 64) | 0)) { border(x, 0); border(x, H - 1); }
for (let y = 0; y < H; y += Math.max(1, (H / 64) | 0)) { border(0, y); border(W - 1, y); }
function border(x, y) { const i = idx(x, y); borderN++; if (data[i + 3] > 16) { borderOpaque++; opaqueSamples.push([data[i], data[i + 1], data[i + 2]]); } }
const bg = opaqueSamples.length ? [0, 1, 2].map(c => { const v = opaqueSamples.map(s => s[c]).sort((a, b) => a - b); return v[v.length >> 1]; }) : [128, 128, 128];

// A baked bg is opaque across the border; a true cutout is alpha~0 there. Only baked
// backgrounds get colour-matched / chroma-keyed — on a cutout the few opaque border pixels
// are figure edges, and matching them would leak the fill into the figure.
const BAKED = has('baked') || (!has('no-baked') && borderOpaque / borderN > 0.08);
const bgNeutralBright = Math.min(...bg) >= WHITE && (Math.max(...bg) - Math.min(...bg)) <= SAT;
const DO_CHROMA = has('chroma') || (BAKED && bgNeutralBright && !has('no-chroma'));

const dist = (i, r, g, b) => Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
const neutralBright = (i) => { const r=data[i], g=data[i+1], b=data[i+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b); return mn >= WHITE && (mx - mn) <= SAT; };

// 1. flood-fill from the border through background pixels
const cleared = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) stack.push(y * W + x); };
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
const tol3 = TOL * 3;
while (stack.length) {
  const p = stack.pop(); if (cleared[p]) continue;
  const x = p % W, y = (p / W) | 0, i = p * 4;
  if (!(data[i + 3] < 16 || (BAKED && dist(i, bg[0], bg[1], bg[2]) <= tol3) || (DO_CHROMA && neutralBright(i)))) continue;
  cleared[p] = 1; data[i + 3] = 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}
// 2. strict global white/grey chroma key for enclosed bg pockets (only when bg is white/grey)
if (DO_CHROMA) for (let p = 0; p < W * H; p++) { const i = p * 4; if (!cleared[p] && data[i + 3] > 0 && neutralBright(i)) data[i + 3] = 0; }
// 3. erode the antialiased fringe, 4. crop + write
erodeEdge();
report('KEYED', `${BAKED ? ' baked' : ' cutout'}${DO_CHROMA ? '+chroma' : ''}`, bg);
