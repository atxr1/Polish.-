// One command builds the site: bundle the code, copy styles and shell, stamp the version into the cache.
// Usage: bun tools/build.mjs [--all | --fetch --assets --zip]
//   --fetch  clone the pinned open-source inputs (tools/sources.json) into vendor/
//   --assets re-run the asset pipeline (PSP files, map paintings, sprites, effects, fonts, audio)
//   --zip    write arena-src-<version>.zip (source, tools, tests, docs, inputs, source manifest)
//   --all    all of the above
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const V = readFileSync(root + 'src/version.js', 'utf8').match(/'([^']+)'/)[1];
const stamp = V + '-' + Date.now().toString(36);
const ALL = process.argv.includes('--all');
if (ALL || process.argv.includes('--fetch')) execSync('bash tools/fetch_sources.sh', { cwd: root, stdio: 'inherit' });
if (ALL || process.argv.includes('--assets')) {
  mkdirSync(root + 'build/data', { recursive: true });
  // PSP sprite faint slots are extracted once into inputs/psp/faint; set PSP_SPRITES=<PSP build assets dir> to redo it
  if (process.env.PSP_SPRITES) execSync('python3 -I tools/psp_faint.py ' + process.env.PSP_SPRITES + ' inputs/psp/faint', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/fx_catalog.py vendor/RawAsset build/data/fx_catalog.json', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/psp_assets.py ' + (process.env.PSP_ASSETS || 'inputs/psp') + ' build/psp', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/paint_maps.py build/psp build/maps', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/build_sprites.py vendor/SpriteCollab site/assets/fighters tools/fighters.json inputs/psp/faint', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/build_assets.py all', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/credits.py', { cwd: root, stdio: 'inherit' });
  execSync('python3 -I tools/serpent_sheets.py', { cwd: root, stdio: 'inherit' });
}
mkdirSync(root + 'site', { recursive: true });
const r = await Bun.build({ entrypoints: [root + 'src/main.js'], outdir: root + 'site', naming: 'app.js', minify: true, target: 'browser', format: 'esm', sourcemap: 'none' });
if (!r.success) { for (const l of r.logs) console.error(l); process.exit(1); }
copyFileSync(root + 'src/ui/styles.css', root + 'site/app.css');
for (const f of ['index.html', 'sw.js']) writeFileSync(root + 'site/' + f, readFileSync(root + 'web/' + f, 'utf8').replaceAll('__V__', stamp));
copyFileSync(root + 'web/manifest.webmanifest', root + 'site/manifest.webmanifest');
writeFileSync(root + 'site/.nojekyll', '');
// size report
const size = (p) => { const s = statSync(p); if (!s.isDirectory()) return s.size; return readdirSync(p).reduce((a, f) => a + size(p + '/' + f), 0); };
const firstLoad = ['index.html', 'app.js', 'app.css', 'apple-touch-icon.png', 'favicon.png', 'assets/ui', 'assets/fx/manifest.json', 'assets/audio/manifest.json', 'assets/fighters/_credits.json', 'assets/audio/music/title.m4a'].reduce((a, f) => a + (existsSync(root + 'site/' + f) ? size(root + 'site/' + f) : 0), 0);
console.log(`built ${stamp}: app.js ${(size(root + 'site/app.js') / 1024).toFixed(0)} KB, first load ≈ ${(firstLoad / 1e6).toFixed(2)} MB, site total ${(size(root + 'site') / 1e6).toFixed(1)} MB`);

if (ALL || process.argv.includes('--zip')) {
  const zip = `arena-src-${V}.zip`;
  execSync(`rm -f ${zip} && zip -qr ${zip} README.md package.json docs src web tools tests inputs -x '*/__pycache__/*' '*.pyc'`, { cwd: root, stdio: 'inherit' });
  console.log('wrote ' + zip + ' ' + (size(root + zip) / 1e6).toFixed(2) + ' MB');
}
