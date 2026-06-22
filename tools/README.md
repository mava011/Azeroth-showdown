# Azeroth Showdown — dev tools

## Visual self-eval harness (`shoot.mjs`)

Renders the **real game** in headless Chromium (real WebGL2 + PNG textures + canvas),
so screenshots match the device. This is how we evaluate visuals offline instead of
guessing.

### One-time setup (per fresh container)
```
cd tools && npm i        # installs playwright-core (small; from npm registry)
```
Chromium itself is already present at `/opt/pw-browsers/chromium-*` — `shoot.mjs`
finds it automatically (override with `AZ_CHROME=/path/to/chrome`). No download needed.

### Run
```
node tools/shoot.mjs                                  # default suite (title + illidan preview + a battle)
node tools/shoot.mjs preview:illidan                  # one hero's preview screen
node tools/shoot.mjs preview:arthas preview:thrall    # several at once
node tools/shoot.mjs battle:illidan,arthas/thrall,jaina   # a battle: me-squad / foe-squad
node tools/shoot.mjs title                            # the menu
```
Output PNGs land in `tools/shots/` (gitignored). Open them with the Read tool to evaluate.

### How it drives the game
The game exposes `window.AZ` (see the test-hook block at the bottom of `index.html`'s
script) and reads a `?az=` URL param on load:
- `?az=preview&hero=<id>` → opens that hero's preview, facing front, spin off.
- `?az=battle&me=<ids>&foe=<ids>` → starts a battle with fixed squads (comma-separated ids).

`window.AZ.roster()` lists all hero ids. These hooks are harmless in normal play.

### Notes
- Viewport is a phone portrait (402×874 @2x) to match the target device.
- The harness waits for `window.AZ.ready` + a settle delay so textures decode and
  animation settles before the shot.
- See `EVAL.md` for the scoring rubric used when reviewing shots.
