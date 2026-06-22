// Composite an RGBA PNG over a solid magenta background so the TRUE alpha is visible
// (the image viewer otherwise shows alpha-0 pixels' leftover RGB and hides holes/leaks).
// Transparent + any keyed-away holes show as magenta; the figure shows clean.
//   node scripts/preview-cutout.mjs public/assets/heroes/uther.png   -> writes /tmp/cutout_uther.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
const BG = [255, 0, 255];                         // magenta — nothing in the art is this colour
for (const file of process.argv.slice(2)) {
  const src = PNG.sync.read(fs.readFileSync(file));
  const out = new PNG({ width: src.width, height: src.height });
  for (let p = 0; p < src.width * src.height; p++) {
    const i = p * 4, a = src.data[i + 3] / 255;
    out.data[i]     = Math.round(src.data[i]     * a + BG[0] * (1 - a));
    out.data[i + 1] = Math.round(src.data[i + 1] * a + BG[1] * (1 - a));
    out.data[i + 2] = Math.round(src.data[i + 2] * a + BG[2] * (1 - a));
    out.data[i + 3] = 255;
  }
  const o = path.join('/tmp', 'cutout_' + path.basename(file));
  fs.writeFileSync(o, PNG.sync.write(out));
  console.log(o);
}
