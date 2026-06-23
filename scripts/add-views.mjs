// Derive side-profile + back-view walk-cycle manifest entries from each hero's front prompt.
// Adds <id>_side and <id>_walk to scripts/assets.json (idempotent). Run once, then generate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAN = path.join(ROOT, 'scripts', 'assets.json');
const m = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const HEROES = ['arthas','sylvanas','uther','grommash','malfurion','thrall','tyrande','jaina','rexxar']; // illidan already done by hand
const have = new Set(m.assets.map(a=>a.id));
function desc(front){ // the character description, before the framing boilerplate
  return front.split(/, (full body|complete head|three-quarter)/i)[0].replace(/\.$/,'');
}
for(const id of HEROES){
  const front = m.assets.find(a=>a.id===id); if(!front) continue;
  const d = desc(front.prompt);
  if(!have.has(id+'_side')) m.assets.push({ id:id+'_side', filename:id+'_side.png', category:'heroes', aspect:'3:4', transparent:true,
    prompt:`SIDE PROFILE VIEW facing right: ${d}, full body strict side-profile silhouette facing to the right, mid walking stride, isolated full-body cutout, no ground, no scenery, vertical.` });
  if(!have.has(id+'_walk')) m.assets.push({ id:id+'_walk', filename:id+'_walk.png', category:'heroes', aspect:'16:9', transparent:true,
    prompt:`A horizontal game sprite-sheet of 4 equal side-by-side frames of a walk cycle, each frame the SAME character ${d}, seen from BEHIND walking away, the COMPLETE figure head-to-feet fully visible in every frame with clear empty margin above and below so nothing is cropped, identical character size standing on one shared ground line, the four frames showing successive walking leg positions, large clear gaps separating the frames, no text, no borders, no numbers.` });
}
fs.writeFileSync(MAN, JSON.stringify(m, null, 2));
console.log('manifest now has', m.assets.length, 'assets');
