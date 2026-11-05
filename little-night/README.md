# LITTLE NIGHT

A first-person stylized horror adventure for the browser. You are two years old. A storm has knocked the power out, the house has become enormous and strange, and a melody is calling from somewhere below. Your only light is **LUMO**, a little clockwork firefly your grandfather built.

Three chapters (Bedroom, Kitchen, Attic), about 20–30 minutes. Built with Three.js, TypeScript and Vite. Every model, texture, sound and note of music is generated in code: there are no external asset files and nothing to license.

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:5188
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ at http://127.0.0.1:4188
npm run package:crazygames   # build + release/little-night-crazygames-v<version>.zip
```

Requires Node 18+. The game works offline; the CrazyGames SDK is only fetched when the game runs inside the CrazyGames portal (or with `?sdk`).

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrows | Left-half joystick |
| Look | Mouse (pointer lock) | Drag on the right half |
| Interact / open / pick up / push / hide | E or left click | Hand button (shows the action) |
| LUMO light on/off, call LUMO back | F or right click | Firefly button |
| Crawl / stand | C | Crawl button |
| Climb (or hop) | Space | Climb button |
| Throw a held toy | E / left click with nothing targeted | Hand button |
| Pause | Esc / P | Pause button |

## How it plays

- **LUMO** is a companion, not a flashlight. It follows you and glows (costs energy), can be **placed on brass perches** to light an area (cheaper, wider, and the only light that works in *deep darkness*), reveals Grandpa's **glow-chalk** hints, powers the magic lantern and the music box, and is recharged at wind-up **Nests**. A lit perch draws THE HUSH, which snuffs it: use that as a lure.
- **Darkness** is dangerous: on unlit floor shadow hands grab you and drag you back to the light (no death, but lost time).
- **THE HUSH** is real AI: it patrols, hears footsteps (walking ~4.5 m, crawling ~1.2 m), doors, clutter (~8 m) and thrown toys (~11 m), investigates, searches hiding places near the noise, chases with line-of-sight, loses you, and can be distracted. If it watched you hide, it knows where you are. Getting caught plays a short scare and reloads the last checkpoint.
- **Fear** rises near THE HUSH and in the dark: breathing, heartbeat, muffled/distorted audio, gentle camera unsteadiness and peripheral darkness. All subtle, never a full-screen filter.

## Project structure

```
src/
  core/         Game (state machine, checkpoints, test hooks), RenderPipeline (renderer + post),
                InputManager, SaveManager, Settings, Events, Context
  player/       PlayerController (walk/crawl/climb/hop/push/hide), Hands, InteractionSystem
  companion/    Lumo (model), LumoController (behaviour, energy, light)
  enemies/      HushModel (shadow shader, procedural gait), HushAI (perception/states), NavGrid (A*), EnemyManager
  systems/      FearSystem, NoiseSystem, InventorySystem, DarkHazardSystem, CinematicSystem
  objects/      Interactable, Door, Drawer, PushableObject, Pickup, Throwable, HideSpot, Fixtures (Perch, Nest, Socket, Dial…)
  levels/       Level (base), Bedroom, Kitchen, Attic, LevelKit (walls/windows/shafts), StaticBatcher, props/
  audio/        AudioManager: procedural Web Audio (rain, thunder, footsteps, creaks, LUMO, THE HUSH, music-box lullaby, pads)
  art/          Textures (canvas-generated), Materials (+ glow-chalk and projector shaders)
  ui/           HUD, Menus (main/pause/settings/credits/chapters/ending), TouchControls, Icons
  integration/  CrazyGamesSDK.ts (all SDK calls live here)
docs/           DESIGN.md (brief, loop, level plan), PLAYTHROUGH_CHECKLIST.md
tests/          playthrough.spec.ts (full automated run + caught/continue), visual.spec.ts (desktop + mobile smoke)
```

## Saving

Versioned saves in `localStorage` (`littlenight.save`, version 2) at every checkpoint: chapter, checkpoint id, puzzle flags (open doors, moved furniture positions, installed parts, dial values), inventory and LUMO's energy. Settings are stored separately (`littlenight.settings.v1`), chapter completion in `littlenight.chapters.v1`. When the CrazyGames SDK is present the save is mirrored to `SDK.data` and the newest copy wins. Unknown/older save versions fall back to the start of their chapter instead of breaking.

## CrazyGames integration

`src/integration/CrazyGamesSDK.ts` is the only file that touches the SDK. It loads `https://sdk.crazygames.com/crazygames-sdk-v3.js` only when running in the portal (iframe / CrazyGames domain, or `?sdk`), with a 4 s timeout and a silent standalone fallback. Calls used:

- `SDK.init()`; `game.loadingStart()` / `loadingStop()` around boot
- `game.gameplayStart()` / `gameplayStop()` on play, pause, menus, focus loss and transitions
- `game.happytime()` when a chapter is completed
- `game.settings.muteAudio` + `game.addSettingsChangeListener` to respect the portal mute
- `data.getItem` / `setItem` / `removeItem` to mirror saves
- `ad.requestAd('midgame', …)` once between chapters (a natural break); audio is muted while it plays. No other ads, no banners, no account prompts.

Before submitting: upload `release/little-night-crazygames-v*.zip` (index.html at the zip root, relative asset paths), then check it in the CrazyGames QA tool.

## Testing

```bash
npm run test:smoke        # desktop + mobile: menu renders, game starts, real input moves the player
npm run test:playthrough  # menu → Bedroom → Kitchen → Attic → ending, plus caught → checkpoint and Continue after reload
npm run inspect:canvas -- --manifest artifacts/evidence.json   # canvas pixel + renderer budget evidence
```

The playthrough solves every puzzle through the real systems (movement with collision, climbing, pushing, LUMO placement, interactions). THE HUSH still runs its scripts but its sight is disabled in that run so it is deterministic. A separate test covers getting caught. The dev/test API (`window.__LN__`) only exists in dev builds or with `?test` in the URL.

On machines without a GPU (headless CI), Chromium falls back to software rendering at a few frames per second; the tests therefore wait in *game* time and use a fast-forward of several fixed 1/30 s steps per rendered frame.

## Performance

- One shadow-casting light (the moon through the windows); Low disables shadows. Shadow maps 1024 (Medium) / 2048 (High).
- Static level meshes are merged by material at build time (`StaticBatcher`), so each room renders in roughly 200–300 draw calls including the shadow pass.
- Post: one combined atmosphere pass (grade, vignette, fear, grain, lightning); bloom only on High. MSAA through the composer target (0/2/4).
- DPR cap 1 / 1.5 / 2 by quality. Mobile (coarse pointer) defaults to Low.

## Credits

Original work. Fonts: Fraunces and Nunito (SIL Open Font License, bundled through `@fontsource`). Story, characters (LUMO, THE HUSH, Grandpa) and the lullaby are original.
