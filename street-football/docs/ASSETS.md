# Assets and licences

Everything shipped in this project may be redistributed in a commercial browser game. No asset is fetched from a third-party server at runtime; the CrazyGames SDK is the one exception, and it loads only on CrazyGames.

| Asset | Source | Licence | Where | Changes |
| --- | --- | --- | --- | --- |
| Characters: male and female base bodies with painted faces, eyes and normal maps; rigged hairstyles (buzzed, parted, long, buns, beard, eyebrows) | Quaternius, *Universal Base Characters* (Standard), https://quaternius.com/packs/universalbasecharacters.html — obtained from the CC0 copy in https://github.com/kirbycope/godot-3d-player-controller-v2 | **CC0 1.0**, see `vendor-src/ubc/LICENSE.txt` | `public/assets/characters/body_male.glb`, `body_female.glb`, `hair.glb` | `tools/prepare-characters.py` re-encodes the textures as resized JPEG/PNG; `tools/prepare-characters.mjs` quantises and meshopt-compresses the meshes |
| Clips: Idle, Walk, Jog, Sprint, Dance, Jump loop, Idle talking, Hit_Chest (UE-style skeleton, matching the base characters) | Quaternius, *Universal Animation Library* (Standard), UE/Godot export — obtained from the CC0 copy in https://github.com/DyingStar-game/DyingStar | **CC0 1.0**, see `vendor-src/ubc/LICENSE.txt` and `vendor-src/ual/LICENSE` | `public/assets/characters/anims.glb` | Mesh removed; only used clips kept; scale tracks and every bone translation except root/pelvis stripped; meshopt |
| Football clips (shot, pass, poke tackle, nine tricks in left and right versions, keeper set / dive / throw, airplane celebration, dejected) | Authored in code on the same skeleton (`src/animation/FootballClips.js`) | Original, project licence | runtime | — |
| Kits, numbers, extra hairstyles (afro, curls, twists, headbands) | Generated in code (`KitMaterial.js`, `Hair.js`). The kit is painted over the CC0 body, which keeps its own painted skin and face. | Original | runtime | — |
| Festoons (bandeirinhas), plastic chairs, crates, dust motes | Procedural (`Festoons.js`, `Vfx.js`) | Original | runtime | — |
| Batucada loop (surdo, caixa, tamborim, agogô, ganzá) | Synthesised (`AudioSystem.js`) | Original | runtime | — |
| Court, asphalt, plaster, brick, graffiti murals, chain-link, nets, ad boards, crowd sprites, ball | Procedurally generated canvases (`src/world/ProceduralTextures.js`, `src/entities/Ball.js`) | Original | runtime | — |
| Neighbourhood geometry | Procedural (`src/world/Neighborhood.js`, `Court.js`) | Original | runtime | — |
| New York, London, Tokyo and Barcelona backdrops, facades, neon signs, court paints and centre art | Procedural (`src/world/Venues.js`, `ProceduralTextures.js`) | Original | runtime | — |
| Celebrations (knee slide, fist pump), fall, stumble, reception, volley, bicycle kick, slide tackle, elastico, sombrero, drag-back | Authored in code (`src/animation/FootballClips.js`); the dance and jump celebrations reuse the CC0 *Dance_Loop* and *Jump_Loop* | Original / CC0 | runtime | — |
| Sound effects, crowd and ambience not listed in the next rows (whistle, crowd bed, "ooh", net, fence, bounce, steps, UI, traffic) | Synthesised with Web Audio at startup (`src/systems/AudioSystem.js`) | Original | runtime | — |
| Ball strikes: hard kick, soft kick, dribble touch, kickboard hit | *Thwack Sounds* (numbers 03, 05, 02, 07), https://opengameart.org/content/thwack-sounds | **CC0 1.0** (stated on the page and in the pack's LICENSE.txt) | `src/assets/audio/kick-hard.mp3`, `kick-soft.mp3`, `touch.mp3`, `board.mp3` | Mono, 32 kHz MP3; layered over the synthesised sound |
| Goalpost hit | *Metal Pole/Low Bell Hit*, https://opengameart.org/content/metal-polelow-bell-hit | **CC0 1.0** | `src/assets/audio/post.mp3` | Trimmed to 1.5 s with a fade, mono 32 kHz MP3; layered over the synthesised ring |
| Applause under the goal cheer | *Applause in a large hall or church*, https://opengameart.org/content/applause-in-a-large-hall-or-church | **CC0 1.0** | `src/assets/audio/applause.mp3` | A 5 s excerpt with fades, mono 32 kHz MP3; mixed with the synthesised crowd roar |
| Fonts: Anton, Barlow Condensed | Google Fonts via `@fontsource` | **SIL OFL 1.1** | bundled by Vite | — |
| three.js | npm `three` | MIT | bundle | — |
| Rapier 3D | npm `@dimforge/rapier3d-compat` | Apache-2.0 | bundle | — |

The shop and brand names on the boards and signs (AÇAÍ DO ZÉ, BAR DO TONHO, PADARIA ESTRELA, JOE’S SLICE, THE ARCHES CAFF, KITSUNE RAMEN, FORN DEL RAVAL, …) and the team names (CANARINHOS, VILA RUBRA, BROOKLYN BRIDGERS, SOUTHWARK ARCHES, SHIBUYA KITSUNE, RAVAL GATS) are fictional. No FIFA, EA or club marks are used.

## Optional upgrades (not required to run)

These sources were named in the brief. None of them was reachable from the build environment, so the shipped game uses the CC0 and procedural sources above. Each upgrade has a drop-in path:

1. **Dressed human characters** — done in Phase 4 with the Quaternius *Universal Base Characters*. To rebuild from source:
   1. Run `python3 -I tools/prepare-characters.py <ubc_dir> <tmp>`.
   2. Run `node tools/prepare-characters.mjs <tmp> <UAL1_Standard.glb>`.
2. **Mixamo characters and animations** (free with an Adobe account; may be used in games, but the raw files may not be redistributed as stand-alone assets): download as FBX with skin, convert to glTF in Blender, and retarget to the UAL rig (for example with Blender's *Rokoko* or *Auto-Rig Pro*). Put the result in `public/assets/characters/`.
3. **Photo-scanned surfaces** — Poly Haven textures (CC0, https://polyhaven.com/textures, for example *concrete_floor_worn_001*, *asphalt_02*, *painted_plaster_wall*): download the 1k JPG diffuse, roughness and normal maps into `public/assets/textures/`. Load them with `TextureLoader` in `Court.js` / `Neighborhood.js` in place of the canvas textures, keeping `repeat` in world units. Keep the procedural versions as the fallback.
4. **Kenney props** (CC0, https://kenney.nl/assets): street furniture such as bins and barriers can be added to `Neighborhood.js` as instanced GLBs.
5. **More recorded audio** — the ball strikes, post and applause are recordings (see the table). The whistle, crowd bed, crowd "ooh", net and fence are still synthesised: freesound.org answered 403 to every request from the build environment, and OpenGameArt had no usable CC0 recordings of those. To add them, decode recordings into the same buffer names in `AudioSystem` (`RECORDINGS`), keeping the synthesised versions as fallbacks.
