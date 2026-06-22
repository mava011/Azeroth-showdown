// Quick alpha report for a generated PNG: dims, aspect, % opaque, and whether the
// border ring is already transparent (true cutout) or baked (needs key-alpha.mjs).
import fs from 'node:fs';
import { PNG } from 'pngjs';
for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: W, height: H, data } = png;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  let opaque = 0; for (let p = 0; p < W * H; p++) if (data[p * 4 + 3] > 8) opaque++;
  let borderOpaque = 0, borderN = 0;
  for (let x = 0; x < W; x++) { borderN += 2; if (A(x, 0) > 16) borderOpaque++; if (A(x, H - 1) > 16) borderOpaque++; }
  for (let y = 0; y < H; y++) { borderN += 2; if (A(0, y) > 16) borderOpaque++; if (A(W - 1, y) > 16) borderOpaque++; }
  const borderPct = (100 * borderOpaque / borderN).toFixed(1);
  const transparentCutout = borderOpaque / borderN < 0.02;
  console.log(`${file.split('/').pop()}  ${W}x${H}  aspect=${(W/H).toFixed(3)}  opaque=${(100*opaque/(W*H)).toFixed(1)}%  borderOpaque=${borderPct}%  => ${transparentCutout ? 'TRUE TRANSPARENT ✓' : 'NEEDS KEY ✗'}`);
}
