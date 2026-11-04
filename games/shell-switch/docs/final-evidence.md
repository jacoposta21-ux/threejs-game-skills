# SHELL SWITCH — final evidence

Run ID `pass-3`, production build (`npm run build` → `vite preview` on :4188), seed 42. All browser work in this container ran on **SwiftShader (software rendering)**: pixel, layout and renderer-count evidence is valid; FPS/frame-time numbers are not, so none are claimed.

## What was built

A complete original 3D adventure-puzzle game in Three.js + TypeScript + Vite: one continuous town with 5 districts plus a hub, 10 possessable hosts (Glim + the 8 requested characters + a bonus Mayor), ~50 NPCs with personalities, 16 missions, 56 Star Bits, 10 hidden postcards, 16 achievements, localStorage saves, title/pause/journal/collection/settings/discovery/ending screens, desktop + touch controls, and fully procedural music/ambience/SFX. Design artifacts: [design.md](design.md).

## Gameplay verification (scripted real input)

`tests/bot/*.mjs` drive the game only through input intents (held WASD/Shift, presses of E/F/Q/Space) plus `lookAt` steering. Setup uses test states; when a mission needs a host that lives in another district, the bot teleports that host to simulate the player walking it over. `?simsteps=6` fast-forwards simulation on the software renderer.

| Bot | Result | Missions completed in the run |
| --- | --- | --- |
| station | pass | S1 Heavy Baggage, S2 City Pass, S3 Newsstand Core |
| mall | pass | M1 Lunch Break, M2 Open Mic, M3 Sparkle & Co. |
| circus | pass | C1 Tough Crowd, C2 Backstage Pass, C3 Shot From a Cannon |
| museum | pass | U1 Lights Out, U2 Haunted Archive, U3 Meteorite Heist (via the alien vent route into the security office) |
| cityhall | pass | H1 Red Tape, H2 Bodyguard's Appetite, H3 Key to the City, F Homeward Bound → ending screen |

Zero page errors or console errors in every bot run. The most recent run of each bot came after the last gameplay-logic change. Changes made after those runs only touched wall detailing, camera collision flags, mobile shadow/draw distance and the F-button label fallback.

Defects found and fixed during playtesting and an independent code review:
- Exception in an NPC bark (unbound RNG) froze the render loop → bound it; loop now survives a throwing frame.
- Q swallowed during host actions → hop-out always works.
- Crowd separation could shove a host through a thin door → collisions re-resolved after pushes; door colliders thickened.
- Museum dinosaur plinth blocked the vent route → narrowed.
- Glim could be trapped in the sealed archive → alien escape vent.
- Step pad accepted the 1.9 m trunk and left gaps by the newsstand → pad accepts crates only and snaps them flush.
- Review blockers: New Game in the same session kept old world state (now reloads to a pristine town); the secret closet was classified as the hub (so eject/unstuck dropped Glim outside the locked turnstiles); crates could be thrown through walls / back into the exit gap; lured hosts walked back to their original spawn; flights and phasing were not cancelled on quit/eject/unstuck; the singer's loop could stick; Facet re-sealed his shop; title Collection ignored the save; Spike now also yields to the singer as the design table says.

## Canvas inspector (`artifacts/evidence.json`, 15 captures, all PASS)

| Capture | Calls | Triangles | Geometries | entropy / edges / contrast |
| --- | --- | --- | --- | --- |
| desktop title | 287 | 140.7k | 253 | 5.24 / 0.334 / 198 |
| desktop active-play (station) | 298 | 148k | 471 | 3.73 / 0.204 / 212 |
| desktop possessed | 260 | 139.7k | 439 | 4.31 / 0.264 / 183 |
| desktop station-core | 276 | 138.2k | 440 | 4.08 / 0.206 / 190 |
| desktop mall | 129 | 87.5k | 349 | 4.11 / 0.255 / 197 |
| desktop circus | 151 | 96.4k | 362 | 4.35 / 0.216 / 195 |
| desktop museum | 156 | 80.2k | 310 | 3.66 / 0.256 / 186 |
| desktop cityhall | 144 | 88.9k | 266 | 3.71 / 0.214 / 186 |
| desktop journal / collection | 298 | 148k | 470 | 3.6 / 0.3 / 82 |
| desktop ending | 22 | 51.8k | 264 | 2.0 / 0.166 / 148 |
| mobile active-play | 101 | 92.4k | 122 | 4.2 / 0.262 / 213 |
| mobile possessed | 66 | 86.9k | 92 | 4.99 / 0.325 / 197 |
| mobile circus | 118 | 87.4k | 145 | 4.78 / 0.274 / 195 |
| mobile journal | 101 | 92.4k | 122 | 3.23 / 0.271 / 82 |

Budget notes: desktop calls stay ≤ 300 in the densest view (the crowded station). Over budget: **geometry count on desktop (up to 471 vs 300)**. Each character keeps ~11 unique merged part geometries so its joints can animate. That costs memory, not draw calls, and the total texture count is 6. On phones and the Low preset, characters use blob shadows only and crowds draw within 42 m, which brought mobile from 216 to 101 calls and inside every mobile budget. The ending capture is mostly sky by design, which explains its low entropy. Screenshots: [docs/screenshots](screenshots/).

`python3 skills/threejs-game-director/scripts/check_evidence.py games/shell-switch --manifest artifacts/evidence.json` → "Evidence check passed: 15 artifact(s) confirmed."

## Visual scorecard (no earlier baseline: before = not captured)

| Category | After | Evidence |
| --- | --- | --- |
| Art direction | 2.5 | toy-town palette carried by world, cast, signs, sticker UI and VFX |
| Hero/player | 2 | authored hosts with faces, emotions, gaits, possession antennae |
| Obstacles/guards | 2 | padlock / keycard / seal telegraphs, lasers, spectral bars, guard ? ! icons |
| Rewards/interactables | 2 | core beams, item rings, step pad, prompts |
| World/environment | 2 | layered districts, skyline, hills, tree belt; interiors still mostly flat walls |
| Materials | 2 | shared vertex-colour roles + rim light + wainscot trim; little surface texture |
| Lighting/render | 2 | ACES, hemisphere + player-following sun shadows, fog; no post |
| VFX/motion | 2 | event VFX for possession, zap, songs, scares, confetti, dust |
| UI/HUD | 2.5 | mission tracker, host bar, suspicion eye, cohesive menus and cards |
| Performance evidence | 2 | per-capture renderer counts and mobile tradeoffs; no hardware FPS |

**Average 2.1: below the 2.3 premium threshold.** No automatic failures stand. A bloom pass was tried and removed because it washed out the bright floors. The next visual pass would be per-district interior set dressing, character outlines or texture detail, and a hardware-GPU performance baseline.

## Not verified here

- Real phones and real GPUs: no FPS measurement exists, only software rendering.
- Audio was exercised headlessly without errors, but nobody listened to it.
- The CrazyGames SDK adapter is untested against the real SDK; without it the adapter is a no-op by design.
