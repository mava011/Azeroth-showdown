# Visual evaluation rubric — Azeroth Showdown

A structured, repeatable way to grade the game's look from `tools/shoot.mjs` shots.
Score each item 1–5; a category's score is the mean. **Be harsh and specific** — cite
the exact shot and what's wrong, not vibes. A 10/10 hero or board only ships when its
weakest item is ≥4.

## The loop (do this for every visual change)
1. `node tools/shoot.mjs <scenarios>` → renders the **real game** to `tools/shots/`.
2. Open each PNG with the Read tool. Score against the rubric below.
3. Write a prioritized punch-list (P0 breaks immersion / P1 quality / P2 polish).
4. Fix → re-shoot → re-score. Repeat until the weakest item is ≥4.
5. Only then deploy + ask the user for a device check.

Because shots come from the real browser, they match the device — trust them.

---

## A. Hero (shot: `preview_<id>.png`, plus the hero in a `battle_*` shot)
| # | Item | 1 (broken) → 5 (excellent) |
|---|------|----------------------------|
| A1 | **Recognizable** as the canonical WoW hero at a glance | generic blob → unmistakable |
| A2 | **Silhouette / readability** (clear shape, reads small in battle) | mush → crisp iconic outline |
| A3 | **Style match** to the painted art bar (no toy/primitive look) | toy → painterly |
| A4 | **Grounding** — feet/hooves on the ring, not floating or sunk | floats → planted |
| A5 | **Scale** vs the other units (not too big/small) | off → consistent |
| A6 | **No artifacts** — clean alpha cutout, no checkerboard/halo/holes | broken → clean |
| A7 | **Animation** — idle bob / attack lunge / hit-flash read well | dead/janky → juicy |

## B. Battlefield & scene cohesion (shot: `battle_*.png`)
| # | Item | 1 → 5 |
|---|------|-------|
| B1 | **Single coherent style** — nothing toy next to painted art | clashing → unified |
| B2 | **Lighting unity** — board, units, backdrop share one light/mood | pasted → one world |
| B3 | **Faction identity** — Alliance (blue/gold) vs Horde (red/black) reads instantly | unclear → obvious |
| B4 | **Composition / scale** — heroes are the focus, minimal dead space | empty → framed |
| B5 | **Backdrop integration** — vista sits naturally on the horizon | sticker → seamless |
| B6 | **Atmosphere** — haze/embers/depth sell an epic warzone | flat → cinematic |
| B7 | **Ground** — painted tiles read, no obvious seams / repetition | tiled → natural |
| B8 | **UI/HUD** legible and on-theme over the scene | clashing → clean |

## C. Polish (any shot)
| # | Item | 1 → 5 |
|---|------|-------|
| C1 | Contact shadows ground every unit/structure | none → soft & correct |
| C2 | Color grade is cohesive (consistent saturation/contrast) | mismatched → graded |
| C3 | No z-fighting, clipping, or popping | broken → clean |
| C4 | Readable at a glance on a phone (the real target) | busy → clear |

---

## Current known issues (update as we go)
- ✅ **B1/B2 (was P0):** all 10 heroes + both faction keeps are now painted sprites,
  the toy margin props (pines/tents/totems) are removed, and the board is graded to
  the dusk backdrop (#69, #70).
- ✅ **B4 (was P1):** heroes scaled up (H 3.9) + tighter frame so they're the focus (#70).
- ✅ **B5 (was P1):** backdrop raised/enlarged so the castle skyline looms (#70).
- **P2 polish (open):** the wooden board rim + river strip are still procedural (read as
  the arena stage, not as units); Malfurion's cutout is framed to the shins (reads
  grounded but not full feet); no per-hero idle/attack *sprite* motion yet (billboards
  bob/lunge as a quad). Re-key from a lime-green `--flat` regen if any cutout shows a
  colour-clash halo (`scripts/key-alpha.mjs --green`).

## Reference bar
The painted Illidan sprite + the painted ground/backdrop are the quality bar. Anything
that looks more "primitive/toy" than those is a P0 until fixed.
