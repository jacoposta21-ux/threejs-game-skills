import type { Page } from '@playwright/test';

/**
 * In-page driver for the dev API (window.__LN__). Movement goes through the
 * input autopilot, so collision, climbing, pushing and triggers are real.
 */
export async function installDriver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __LN__: any; __T: any };
    const L = w.__LN__;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    // Waits are in GAME time (the harness may fast-forward or render slowly).
    const wait = async (ms: number) => {
      const end = L.time() + ms / 1000;
      const wallEnd = performance.now() + ms * 40 + 5000;
      while (L.time() < end && performance.now() < wallEnd) await frame();
    };
    const gameNow = () => L.time() * 1000;
    w.__T = {
      wait,
      state: () => L.state(),
      async walk(x: number, z: number, opts: { tol?: number; timeout?: number; crawl?: boolean } = {}) {
        const tol = opts.tol ?? 0.18;
        const timeout = opts.timeout ?? 9000;
        const start = gameNow();
        if (opts.crawl !== undefined && L.state().crawling !== opts.crawl) {
          L.press('crawl');
          await wait(250);
        }
        let last = L.state().pos;
        let stuck = 0;
        while (gameNow() - start < timeout) {
          const s = L.state();
          const dx = x - s.pos[0];
          const dz = z - s.pos[2];
          const d = Math.hypot(dx, dz);
          if (d < tol) break;
          L.setYaw(Math.atan2(-dx, -dz), L.game.player.pitch);
          L.move(0, d < 0.4 ? 0.5 : 1);
          await frame();
          const moved = Math.hypot(s.pos[0] - last[0], s.pos[2] - last[2]);
          stuck = moved < 0.0005 ? stuck + 1 : 0;
          last = s.pos;
          if (stuck > 30) break;
        }
        L.stop();
        await wait(120);
        const p = L.state().pos;
        return { pos: p, ok: Math.hypot(x - p[0], z - p[2]) < tol + 0.12 };
      },
      async face(x: number, y: number, z: number) {
        L.lookAt(x, y, z);
        await wait(80);
        L.lookAt(x, y, z);
        await wait(80);
        return L.state().prompt;
      },
      async use(x: number, y: number, z: number) {
        L.lookAt(x, y, z);
        await wait(120);
        L.lookAt(x, y, z);
        await wait(60);
        const before = L.state();
        L.press('interact');
        await wait(220);
        return { prompt: before.prompt, disabled: before.promptDisabled, target: before.target };
      },
      /** Aim at an interactable's hit volume (by id) and press E. */
      async useId(id: string) {
        const item = L.game.interactions.find(id);
        if (!item) return { prompt: null, disabled: true, target: null };
        const v = new L.THREE.Vector3();
        item.hit[0].getWorldPosition(v);
        L.lookAt(v.x, v.y, v.z);
        await wait(200);
        item.hit[0].getWorldPosition(v);
        L.lookAt(v.x, v.y, v.z);
        await wait(150);
        const before = L.state();
        L.press('interact');
        await wait(220);
        return { prompt: before.prompt, disabled: before.promptDisabled, target: before.target };
      },
      async jump() {
        L.press('jump');
        await wait(2400);
        return L.state().pos;
      },
      async push(dirYaw: number, forward: number, until: () => boolean, timeout = 9000) {
        const start = gameNow();
        L.setYaw(dirYaw, -0.2);
        while (gameNow() - start < timeout) {
          if (until()) break;
          L.setYaw(dirYaw, -0.2);
          L.move(0, forward);
          await frame();
        }
        L.stop();
        await wait(150);
        L.press('interact');
        await wait(200);
        return until();
      },
      async waitFor(fn: () => boolean, timeout = 20000) {
        const start = gameNow();
        const wallEnd = performance.now() + timeout * 40 + 5000;
        while (gameNow() - start < timeout && performance.now() < wallEnd) {
          if (fn()) return true;
          await frame();
        }
        return false;
      },
      async skip() {
        for (let i = 0; i < 10 && L.state().cinematic; i++) {
          L.skipCinematic();
          await wait(100);
        }
      },
    };
  });
}
