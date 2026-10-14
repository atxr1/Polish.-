import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 932, height: 430 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8077/?lab=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__lab);
const r = await page.evaluate(async () => {
  const L = window.__lab, out = [];
  await L.start({ env: 'air', format: 'pokemon', map: 'sky_pillar', seed: 7, sides: [{ team: ['rayquaza'], control: 'dummy' }, { team: ['zapdos'], control: 'dummy' }] }, { manual: true, settle: 60 });
  const S = L.scene.S, f = S.activeOf(0);
  const log = (t) => out.push(t + ' state=' + f.state + ' st=' + f.st + ' hitstun=' + f.hitstun + ' stam=' + f.stamina.toFixed(0) + ' cds=' + f.cds.join(',') + ' move=' + (f.move && f.move.def.id) + ' phase=' + S.phase + ' x=' + f.x.toFixed(0));
  log('start');
  for (const slot of [0, 1, 2, 3]) {
    f.stamina = 100; f.cds = [0, 0, 0, 0];
    L.step(1, { 0: { slot } }); log('press ' + slot);
    L.step(30, { 0: {} }); log('+30');
    L.step(200, { 0: {} }); log('+230');
  }
  return out;
});
console.log(r.join('\n'));
await browser.close();
