# Hero sprite art (2.5D billboards)

Drop a transparent-background PNG here per hero, named by the hero id, e.g.:

```
assets/heroes/illidan.png
assets/heroes/arthas.png
...
```

Then enable it in `index.html` by adding the id to the `HERO_ART` map
(search for `const HERO_ART`), e.g.:

```js
const HERO_ART = {
  illidan: 'assets/heroes/illidan.png',
};
```

When a hero id is present in `HERO_ART`, the game renders that hero as a
camera-facing billboard sprite (with idle bob, attack lunge, hit-flash, whirlwind,
death, drop shadow, health bar) instead of the procedural 3D primitive model.

## Art spec
- **Transparent background** PNG (alpha cutout — the silhouette is what shows).
- **Full body**, standing, weapon(s) in hand, facing slightly 3/4 toward the viewer
  (Clash-Royale style). The character should look good when seen from a slightly
  elevated camera.
- **Tall portrait framing**, character filling most of the frame, feet near the
  bottom edge. Suggested canvas ~768×1066 (a ~0.72 width:height ratio). If a hero's
  art has a different ratio, set it in `HERO_ART_ASPECT` (id → width/height).
- **Consistent lighting + style** across the whole roster so the lineup feels cohesive
  (same light direction, same rendering style, same ground contact).
- Keep important silhouette elements (horns, wings, weapons) inside the frame.

## Tips
- Generate at 2× and let the engine downscale (anisotropic filtering is on).
- Avoid hard drop-shadows baked into the art — the game adds its own ground shadow.
- Team color is conveyed by the base ring + UI, so art can stay team-neutral.
