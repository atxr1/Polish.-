// Shape lint: the world is drawn only with pixel art. Fails if any world-rendering module uses vector shapes,
// gradients, blur or smoothing (HUD and menus are exempt: src/ui/, src/modes/battle.js HUD calls).
// Usage: bun tools/shapelint.mjs
import { readFileSync } from 'node:fs';

const FILES = ['src/render/world.js', 'src/render/fx.js', 'src/render/pixelart.js', 'src/render/serpentArt.js', 'src/render/gfx.js'];
const BANNED = [
  [/\.arc\s*\(/, 'arc'], [/\.arcTo\s*\(/, 'arcTo'], [/\.ellipse\s*\(/, 'ellipse'], [/\.lineTo\s*\(/, 'lineTo'], [/\.moveTo\s*\(/, 'moveTo'],
  [/\.stroke\s*\(/, 'stroke'], [/\.strokeRect\s*\(/, 'strokeRect'], [/\.fill\s*\(\s*\)/, 'path fill'], [/\.bezierCurveTo\s*\(/, 'bezier'],
  [/\.quadraticCurveTo\s*\(/, 'quadratic'], [/create(Linear|Radial|Conic)Gradient/, 'gradient'], [/\.filter\s*=/, 'filter'],
  [/shadowBlur/, 'shadowBlur'], [/imageSmoothingEnabled\s*=\s*true/, 'smoothing on'], [/\.fillText\s*\(/, 'vector text'],
];
const ROOT = new URL('../', import.meta.url).pathname;
const hits = [];
for (const f of FILES) {
  const lines = readFileSync(ROOT + f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const code = l.replace(/\/\/.*$/, '');
    for (const [re, name] of BANNED) if (re.test(code)) hits.push(`${f}:${i + 1}: ${name}: ${l.trim().slice(0, 120)}`);
  });
}
// every canvas the world draws into must have smoothing off
const world = readFileSync(ROOT + 'src/render/world.js', 'utf8'), gfx = readFileSync(ROOT + 'src/render/gfx.js', 'utf8'), battle = readFileSync(ROOT + 'src/modes/battle.js', 'utf8');
if (!/this\.b = ctx2d\(/.test(world)) hits.push('src/render/world.js: world buffer context is not created with ctx2d()');
if (!/function ctx2d[^\n]*imageSmoothingEnabled = false/.test(gfx)) hits.push('src/render/gfx.js: ctx2d() must disable smoothing');
if (!/ctx\.imageSmoothingEnabled = false/.test(battle)) hits.push('src/modes/battle.js: the integer upscale must disable smoothing');
if (/getContext\('2d'/.test(world)) hits.push('src/render/world.js: raw getContext (use ctx2d)');
console.log(`shape lint: ${FILES.length} files, ${hits.length} violations`);
for (const h of hits) console.log('  ' + h);
process.exit(hits.length ? 1 : 0);
