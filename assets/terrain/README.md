# Battlefield art (painted ground + backdrop)

Drop PNGs here, then set the paths in `index.html`:

```js
const TERRAIN_ART = { alliance:'assets/terrain/alliance.png', horde:'assets/terrain/horde.png' };
const BACKDROP_ART = 'assets/terrain/backdrop.png';
```

- **alliance.png / horde.png** — SEAMLESS / TILEABLE top-down ground textures
  (square, ~1024×1024). They tile 2×2 across each half of the field. Keep them
  fairly even/low-contrast so units read on top.
- **backdrop.png** — a wide painted Azeroth vista (landscape, ~1920×1080) shown
  on a large plane behind the far end of the board.

If a path is left `null`, the game falls back to the procedural canvas texture /
gradient sky, so partial art is fine.
