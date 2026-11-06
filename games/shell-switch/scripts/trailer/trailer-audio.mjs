import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...r) {
    if (dst instanceof AudioDestinationNode) {
      const ctx = this.context;
      if (!ctx.__rec) {
        ctx.__rec = ctx.createMediaStreamDestination();
      }
      orig.call(this, ctx.__rec);
    }
    return orig.call(this, dst, ...r);
  };
});
page.on('pageerror', (e) => console.log('err', e.message));
await page.goto('http://127.0.0.1:4188/');
await page.waitForFunction(() => window.__SHELL__, null, { timeout: 120000 });
const b64 = await page.evaluate(async () => {
  const g = window.__SHELL__.game;
  g.loop.stop();
  const A = g.audio;
  A.unlock();
  A.setVolumes(0.8, 1);
  A.setMusic('finale');
  const ctx = A.ctx;
  await ctx.resume();
  const rec = new MediaRecorder(ctx.__rec.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const P = { x: 0, y: 0, z: 0 };
  const tl = [
    [0.25, () => A.play('land')], [0.6, () => A.voice('alien', 5, 1)],
    [3.95, () => A.play('possess')], [5.5, () => A.voice('strongman', 5, 1)],
    [7.7, () => A.play('lift')], [9.25, () => A.play('throw')], [9.75, () => A.play('thud')],
    [11.12, () => A.play('honk')], [11.4, () => A.play('juggle')], [12.2, () => A.play('cheer', { volume: 0.7 })], [13.2, () => A.play('clap')],
    [14.55, () => A.startLoop('sing')], [17.45, () => A.stopLoop('sing')],
    [17.6, () => { A.play('boo'); A.play('phase'); }], [17.8, () => A.startLoop('phaseLoop')], [20.45, () => A.stopLoop('phaseLoop')],
    [20.77, () => A.play('cannon')], [22.3, () => A.play('land')], [22.4, () => A.play('chime')],
    [23.7, () => { A.play('proclaim'); A.play('cheer'); }], [24.6, () => A.play('clap')],
    [27.05, () => A.play('core')], [27.6, () => A.play('achievement')],
  ];
  // restart music so the trailer starts at the top of the track
  await new Promise((r) => setTimeout(r, 300));
  rec.start(250);
  const t0 = performance.now();
  let k = 0;
  await new Promise((done) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      while (k < tl.length && tl[k][0] <= t) { try { tl[k][1](); } catch (e) { console.log(e); } k++; }
      A.update(0.016, P, 0);
      if (t >= 30.6) return done();
      setTimeout(tick, 10);
    };
    tick();
  });
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  const buf = await new Blob(chunks).arrayBuffer();
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
});
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out);
await browser.close();
