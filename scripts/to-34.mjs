// Convert every rear-view (_back) and walk (_walk) prompt to a THREE-QUARTER REAR angle so the
// legs are visible stepping (the Clash-style readable walk). Idempotent-ish; run once.
import fs from 'node:fs';
const MAN='scripts/assets.json';
const m=JSON.parse(fs.readFileSync(MAN,'utf8'));
const heroes=['illidan','arthas','sylvanas','uther','malfurion','thrall','tyrande','jaina','rexxar'];
const W34='seen from a THREE-QUARTER REAR angle (from behind and turned about 35 degrees to the side so we clearly see the back AND one side AND both legs, the legs plainly visible doing the stepping with one foot forward and the other pushing back), walking away,';
let n=0;
for(const h of heroes){
  const back=m.assets.find(a=>a.id===h+'_back');
  if(back){ back.prompt=back.prompt
    .replace('BACK VIEW seen from directly behind:','THREE-QUARTER REAR VIEW, from behind and turned about 35 degrees to the side so both legs are clearly visible:')
    .replace('seen from behind,','seen from behind at a three-quarter angle,')
    .replace('facing away from viewer,','facing away from the viewer at a three-quarter angle,')
    .replace('full body rear view','full body three-quarter rear view, both legs visible'); n++; }
  const walk=m.assets.find(a=>a.id===h+'_walk');
  if(walk){ walk.prompt=walk.prompt.replace('seen from BEHIND walking away,',W34); }
}
fs.writeFileSync(MAN, JSON.stringify(m,null,2));
console.log('converted', n, 'heroes (_back + _walk) to 3/4-rear');
