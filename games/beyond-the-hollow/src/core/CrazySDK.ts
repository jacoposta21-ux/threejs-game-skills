/**
 * Thin, failure-tolerant wrapper around the CrazyGames HTML5 SDK v3.
 * The SDK is only loaded when the game runs on a CrazyGames domain (or with ?crazygames),
 * so local play and other portals never block on it.
 */
import { Sound } from './Audio';

type SDK = any;
let sdk: SDK | null = null;
let ready = false;
let gameplay = false;

function wantSdk() {
  const h = location.hostname;
  return /crazygames/.test(h) || /[?&]crazygames/.test(location.search);
}

export const Crazy = {
  async init(): Promise<void> {
    if (!wantSdk()) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('sdk load failed'));
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('sdk timeout')), 6000);
      });
      sdk = (window as any).CrazyGames?.SDK ?? null;
      if (sdk) {
        await sdk.init();
        ready = true;
      }
    } catch {
      sdk = null;
    }
  },
  loadingStart() {
    try { if (ready) sdk.game.loadingStart(); } catch { /* */ }
  },
  loadingStop() {
    try { if (ready) sdk.game.loadingStop(); } catch { /* */ }
  },
  gameplayStart() {
    if (gameplay) return;
    gameplay = true;
    try { if (ready) sdk.game.gameplayStart(); } catch { /* */ }
  },
  gameplayStop() {
    if (!gameplay) return;
    gameplay = false;
    try { if (ready) sdk.game.gameplayStop(); } catch { /* */ }
  },
  happytime() {
    try { if (ready) sdk.game.happytime(); } catch { /* */ }
  },
  /** Midgame ad between chapters. Resolves when finished or immediately if no SDK. */
  midgameAd(): Promise<void> {
    if (!ready) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        sdk.ad.requestAd('midgame', {
          adStarted: () => Sound.suspend(true),
          adFinished: () => { Sound.suspend(false); resolve(); },
          adError: () => { Sound.suspend(false); resolve(); },
        });
      } catch {
        resolve();
      }
    });
  },
};
