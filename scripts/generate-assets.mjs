// Azeroth Showdown — asset generation pipeline (OpenAI Images -> public/assets/).
//
// Reads scripts/assets.json, generates each PNG via the OpenAI image API, and writes
// it to the correct public/assets/<category>/ folder. Skips existing files unless
// --force. Logs generated/skipped/failed and records prompt metadata for traceability.
//
// Usage:
//   npm run generate:assets                 # generate any missing assets
//   npm run generate:assets -- --force      # regenerate everything
//   npm run generate:assets -- --only=alliance_keep      # one asset (by id)
//   npm run generate:assets -- --only=tiles              # one category
//   npm run generate:assets -- --flat       # transparent assets on a lime-green key bg instead
//
// Requires OPENAI_API_KEY in the environment (or a local, gitignored .env). Never hardcode it.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'scripts', 'assets.json');
const META     = path.join(ROOT, 'public', 'assets', 'assets.meta.json');

const args  = process.argv.slice(2);
const FORCE = args.includes('--force') || args.includes('-f');
const FLAT  = args.includes('--flat');                                  // chroma-key fallback
const ONLY  = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

// category -> output folder (relative to repo root)
const CATEGORY_DIR = {
  heroes:     'public/assets/heroes',
  structures: 'public/assets/structures',
  tiles:      'public/assets/tiles',
  backdrops:  'public/assets/backdrops',
};
// requested aspect -> nearest size the image model supports
const ASPECT_SIZE = { '3:4': '1024x1536', '2:3': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024', '3:2': '1536x1024' };

function die(msg){ console.error('✖ ' + msg); process.exit(1); }

if (!process.env.OPENAI_API_KEY)
  die('OPENAI_API_KEY is not set. Export it or put it in a local .env (never commit it).');
if (!fs.existsSync(MANIFEST)) die('Manifest not found: ' + path.relative(ROOT, MANIFEST));

const client   = new OpenAI();                              // reads OPENAI_API_KEY from env
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const STYLE    = manifest.style || '';                      // shared style block appended to prompts
const assets   = Array.isArray(manifest) ? manifest : (manifest.assets || []);
const meta     = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
const log      = { generated: [], skipped: [], failed: [] };

function buildPrompt(a){
  let p = a.rawPrompt ? a.prompt : (a.prompt + (STYLE ? ' ' + STYLE : ''));
  if (a.transparent && FLAT)
    p += ' Place the subject on a perfectly flat solid chroma-key lime-green (#00ff00) background, no gradient, no shadow, for later background removal.';
  return p;
}

for (const a of assets){
  if (ONLY && a.id !== ONLY && a.category !== ONLY) continue;
  const dir = CATEGORY_DIR[a.category];
  if (!dir){ log.failed.push({ id: a.id, err: 'unknown category: ' + a.category }); console.log('FAIL  ', a.id, '(unknown category)'); continue; }

  const outPath = path.join(ROOT, dir, a.filename);
  if (fs.existsSync(outPath) && !FORCE){ log.skipped.push(a.id); console.log('SKIP  ', a.id, '(exists)'); continue; }

  const transparent = !!a.transparent && !FLAT;
  const size = ASPECT_SIZE[a.aspect] || '1024x1024';
  try {
    process.stdout.write('GEN   ' + a.id + ' (' + a.category + ', ' + size + ') ... ');
    const res = await client.images.generate({
      model: 'gpt-image-1',
      prompt: buildPrompt(a),
      size,
      background: transparent ? 'transparent' : 'opaque',
      output_format: 'png',
      quality: a.quality || 'high',
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error('no image data returned');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    meta[a.id] = { filename: a.filename, category: a.category, aspect: a.aspect, size,
      transparent, flatBg: !!(a.transparent && FLAT), model: 'gpt-image-1',
      prompt: buildPrompt(a), generatedAt: new Date().toISOString() };
    log.generated.push(a.id);
    console.log('OK -> ' + path.join(dir, a.filename));
  } catch (e){
    log.failed.push({ id: a.id, err: e?.message || String(e) });
    console.log('FAIL  ' + (e?.message || e));
  }
}

fs.mkdirSync(path.dirname(META), { recursive: true });
fs.writeFileSync(META, JSON.stringify(meta, null, 2));

console.log('\n— Summary —');
console.log('  generated: ' + log.generated.length + (log.generated.length ? '  [' + log.generated.join(', ') + ']' : ''));
console.log('  skipped:   ' + log.skipped.length);
console.log('  failed:    ' + log.failed.length + (log.failed.length ? '  [' + log.failed.map(f => f.id).join(', ') + ']' : ''));
console.log('  metadata:  ' + path.relative(ROOT, META));
if (log.failed.length){ for (const f of log.failed) console.log('    ✖ ' + f.id + ': ' + f.err); process.exitCode = 1; }
