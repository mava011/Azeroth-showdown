# Azeroth Showdown

A Warcraft-inspired, touch-first browser/mobile auto-battler (single-file `index.html`,
Three.js). Heroes, structures, ground, and backdrop use **painted PNG art** rendered as
2.5D billboards over a 3D battlefield.

- **Play / source:** open `index.html` (served from the repo root; e.g. GitHub Pages).
- **Art assets:** `public/assets/{heroes,structures,tiles,backdrops}/`
- **Asset generator:** `scripts/generate-assets.mjs` (OpenAI Images)
- **Visual self-eval harness:** `tools/` (headless Chromium — see `tools/README.md`)

---

## Asset generation pipeline

Define art in a JSON manifest, run one command, and PNGs are generated into the right
folders with consistent names + prompt metadata. ChatGPT is the art director (refining
prompts); this script is the executor.

### 1. Set your API key (never commit it)
The script reads **`OPENAI_API_KEY`** from the environment. Either export it:
```bash
export OPENAI_API_KEY=sk-...
```
…or copy `.env.example` to `.env` (which is **gitignored**) and put the key there:
```bash
cp .env.example .env      # then edit .env
```
> ⚠️ Treat the key like a password. If it ever leaks, rotate it at
> https://platform.openai.com/api-keys . It is only ever used server-side by this script —
> never shipped to the browser/game.

### 2. Install + run
```bash
npm install
npm run generate:assets                 # generate any MISSING assets
npm run generate:assets -- --force      # regenerate everything (overwrite)
npm run generate:assets -- --only=alliance_keep   # one asset by id
npm run generate:assets -- --only=heroes          # one whole category
npm run generate:assets -- --flat       # see "Transparency" below
```
The script logs each asset as `GEN` / `SKIP` / `FAIL`, prints a summary, and writes prompt
metadata to `public/assets/assets.meta.json` for traceability.

### 3. The manifest — `scripts/assets.json`
```jsonc
{
  "style": "shared style block appended to every prompt for a consistent look",
  "assets": [
    {
      "id": "alliance_keep",          // unique id (used by --only and metadata)
      "filename": "alliance_keep.png",// output file name
      "category": "structures",       // heroes | structures | tiles | backdrops
      "aspect": "3:4",                // 3:4 | 1:1 | 16:9  (mapped to nearest model size)
      "transparent": true,            // request a transparent PNG cutout
      "prompt": "subject + framing ...",
      "rawPrompt": false,             // optional: true = don't append the shared style
      "quality": "high"               // optional: high | medium | low
    }
  ]
}
```
Final prompt = `prompt` + (`style` unless `rawPrompt`). The shared `style` keeps the whole
roster consistent; per-asset prompts only describe the subject + framing.

### Categories → folders & sizes
| category    | folder                       | typical aspect | transparent | model size  |
|-------------|------------------------------|----------------|-------------|-------------|
| heroes      | `public/assets/heroes/`      | 3:4 (vertical) | yes         | 1024×1536   |
| structures  | `public/assets/structures/`  | 3:4 (vertical) | yes         | 1024×1536   |
| tiles       | `public/assets/tiles/`       | 1:1 (square)   | no (opaque) | 1024×1024   |
| backdrops   | `public/assets/backdrops/`   | 16:9 (wide)    | no (opaque) | 1536×1024   |

(The image model — `gpt-image-1` — supports 1024×1024 / 1024×1536 / 1536×1024, so each
requested aspect maps to the nearest supported size.)

### Transparency & the chroma-key fallback
- Heroes and structures request **true transparent PNG** output (`background:"transparent"`).
- If a model/run gives unreliable cutouts, run with **`--flat`**: transparent assets are
  instead generated on a flat **lime-green (#00ff00)** background for later removal in your
  image editor.
- Tiles and backdrops are always **opaque**; tiles should be **seamless/tileable** and
  **low-contrast** so heroes read clearly on top.

### Wiring new art into the game
The game references art via `HERO_ART`, `STRUCT_ART`, `TERRAIN_ART`, `BACKDROP_ART` near the
top of `index.html`'s script. After generating a new asset, add/enable its path there (e.g.
`STRUCT_ART.alliance = 'public/assets/structures/alliance_keep.png'`).

---

## Visual self-eval harness
`tools/shoot.mjs` renders the **real game** in headless Chromium and screenshots it, so we
can review changes without a device. See **`tools/README.md`** and the scoring rubric in
**`tools/EVAL.md`**.
