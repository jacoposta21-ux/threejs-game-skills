import { open } from './botlib.mjs';
export async function start(state) {
  const B = await open();
  await B.page.evaluate(() => localStorage.clear());
  await B.page.evaluate((s) => window.__THREE_GAME_TEST_HOOKS__.setState(s), state);
  await B.page.waitForTimeout(800);
  await B.closeCard();
  return B;
}
const NAMES = { strongman: 'Brick', police: 'Pina', clown: 'Noodle', chef: 'Bun', thief: 'Slink', singer: 'Velvet', ghost: 'Mopewell', scientist: 'Volta', mayor: 'Mayor' };
export async function possess(B, id, kind) {
  await B.approach(B.npcPos(id), new RegExp('Possess.*' + NAMES[kind]), 'e', 60000);
  await B.press('interact', 100);
  await B.waitHost(kind);
  // A first possession opens the discovery card (game paused) a moment later.
  const first = await B.page.evaluate(() => window.__SHELL__.game.state === 'card' || !!document.querySelector('[data-a=ok]'));
  await B.page.waitForFunction(() => window.__SHELL__.game.state === 'card', null, { timeout: first ? 100 : 3000 }).catch(() => {});
  await B.page.evaluate(() => document.querySelector('[data-a=ok]')?.click());
  await B.waitFor(() => window.__SHELL__.game.state === 'play', null, 5000);
}
export async function exit(B) {
  await B.press('exit', 100);
  await B.waitHost('alien');
  await B.page.waitForTimeout(600);
}
export async function park(B, host, x, y, z) {
  await B.page.evaluate(([h, x, y, z]) => { const g = window.__SHELL__.game; const c = g.hostChars.get(h); c.place(x, y, z, 0); const n = g.npcById.get(c.id); n.home.set(x, y, z); n.goHome(); }, [host, x, y, z]);
}
export async function finish(B, name) {
  await B.log('FINAL');
  await B.page.screenshot({ path: `artifacts/bot/${name}.png` });
  console.log('ERRORS', B.errs.slice(0, 8).join(' | ') || 'none');
  await B.browser.close();
}
