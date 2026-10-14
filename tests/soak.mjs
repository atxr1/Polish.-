// 10-minute soak: back-to-back CPU-vs-CPU battles at real speed (Rematch each time), cycling environments and
// formats, sampling frame time, FPS and JS heap every 20 s. Fails on page errors, a growing heap or slow frames.
// Usage: node tests/soak.mjs [minutes]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const MIN = +(process.argv[2] || 10);
mkdirSync('shots/soak', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8077/?test&autoplay', { waitUntil: 'networkidle' });
const setups = [['ground', 'pokemon'], ['water', 'trainer'], ['air', 'pokemon'], ['ground', 'trainer'], ['water', 'pokemon'], ['air', 'trainer']];
const samples = [];
const t0 = Date.now();
let battles = 0, k = 0;
async function startBattle(env, format) {
  await page.evaluate(([env, format]) => {
    const a = window.__app, sc = a.screens;
    const c = Object.assign({}, a.store.read('last'), { env, format, opponent: 'random', map: 'random', level: 'hard', mode: 'quick' });
    sc.launchQuick(Object.assign(c, { fighter: undefined }));
  }, [env, format]);
}
while (Date.now() - t0 < MIN * 60000) {
  const [env, format] = setups[k++ % setups.length];
  await startBattle(env, format);
  battles++;
  // sample while the battle runs; results screen ends it
  while (Date.now() - t0 < MIN * 60000) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const a = window.__app, sc = a.scene;
      const fm = sc && sc.frameMs && sc.frameMs.length ? sc.frameMs.slice().sort((x, y) => x - y) : [0];
      return { results: !!document.querySelector('.screen.results'), fps: Math.round(a.fps), frameAvg: +(fm.reduce((p, q) => p + q, 0) / fm.length).toFixed(2), frameP95: +fm[Math.floor(fm.length * 0.95)].toFixed(2), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, parts: sc && sc.fx ? sc.fx.parts.length : 0 };
    });
    if (s.frameAvg) samples.push(Object.assign({ t: Math.round((Date.now() - t0) / 1000), battle: battles, env, format }, s));
    if (s.results) break;
  }
}
await page.screenshot({ path: 'shots/soak/end.png' });
const heaps = samples.map((s) => s.heapMB).filter((x) => x);
const first = heaps.slice(0, 5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, heaps.length));
const last = heaps.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, heaps.length));
const avg = samples.reduce((a, s) => a + s.frameAvg, 0) / Math.max(1, samples.length);
const p95 = Math.max(...samples.map((s) => s.frameP95));
const report = { minutes: MIN, battles, samples: samples.length, frameAvgMs: +avg.toFixed(2), worstP95Ms: p95, heapStartMB: +first.toFixed(1), heapEndMB: +last.toFixed(1), errors: [...new Set(errs)] };
writeFileSync('shots/soak/report.json', JSON.stringify({ report, samples }, null, 1));
console.log(JSON.stringify(report));
const fail = errs.length || last > first * 1.6 + 10 || avg > 12;
await browser.close();
process.exit(fail ? 1 : 0);
