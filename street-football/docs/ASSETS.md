# Assets and licences

Everything shipped in this project may be redistributed in a commercial browser game. No asset is fetched from a third-party server at runtime; the CrazyGames SDK is the one exception, and it loads only on CrazyGames.

| Asset | Source | Licence | Where | Changes |
| --- | --- | --- | --- | --- |
| Character mesh, skeleton and locomotion clips (Idle, Walk, Jog, Sprint, Dance, Jump loop, Idle talking) | Quaternius, *Universal Animation Library* (Standard), https://quaternius.itch.io/universal-animation-library — obtained via the CC0 mirror https://github.com/J-Ponzo/gltf-universal-animation-library | **CC0 1.0** (public domain), see `vendor-src/ual/LICENSE` | `public/assets/characters/footballer.glb` | Built by `tools/prepare-assets.mjs`: unused clips and static channels removed, mesh quantised (KHR_mesh_quantization) and meshopt-compressed (1.97 MB → 277 KB) |
| Football clips (shot, pass, keeper set / dive / throw, airplane celebration, dejected) | Authored in code on the same skeleton (`src/animation/FootballClips.js`) | Original, project licence | runtime | — |
| Kits, numbers, faces, hairstyles | Generated in code (`KitMaterial.js`, `Hair.js`) | Original | runtime | — |
| Court, asphalt, plaster, brick, graffiti murals, chain-link, nets, ad boards, crowd sprites, ball | Procedurally generated canvases (`src/world/ProceduralTextures.js`, `src/entities/Ball.js`) | Original | runtime | — |
| Neighbourhood geometry | Procedural (`src/world/Neighborhood.js`, `Court.js`) | Original | runtime | — |
| All sound effects and ambience | Synthesised with Web Audio at startup (`src/systems/AudioSystem.js`) | Original | runtime | — |
| Fonts: Anton, Barlow Condensed | Google Fonts via `@fontsource` | **SIL OFL 1.1** | bundled by Vite | — |
| three.js | npm `three` | MIT | bundle | — |
| Rapier 3D | npm `@dimforge/rapier3d-compat` | Apache-2.0 | bundle | — |

The shop and brand names on the boards and signs (AÇAÍ DO ZÉ, BAR DO TONHO, PADARIA ESTRELA, …) and the team names (CANARINHOS, VILA RUBRA) are fictional. No FIFA, EA or club marks are used.

## Optional upgrades (not required to run)

These sources were named in the brief. None of them was reachable from the build environment, so the shipped game uses the CC0 and procedural sources above. Each upgrade has a drop-in path:

1. **Dressed human characters** — Quaternius *Universal Base Characters* (CC0, https://quaternius.com) use the **same UAL skeleton**:
   1. Export a character as glTF.
   2. Add it as a second input to `tools/prepare-assets.mjs`, or replace the source `.gltf`.
   3. Re-run `npm run prepare-assets -- <path>`.

   Bone names match, so every clip, including the authored football clips, plays unchanged. The kit shader classifies regions from bone weights, so it keeps working.
2. **Mixamo characters and animations** (free with an Adobe account; may be used in games, but the raw files may not be redistributed as stand-alone assets): download as FBX with skin, convert to glTF in Blender, and retarget to the UAL rig (for example with Blender's *Rokoko* or *Auto-Rig Pro*). Put the result in `public/assets/characters/`.
3. **Photo-scanned surfaces** — Poly Haven textures (CC0, https://polyhaven.com/textures, for example *concrete_floor_worn_001*, *asphalt_02*, *painted_plaster_wall*): download the 1k JPG diffuse, roughness and normal maps into `public/assets/textures/`. Load them with `TextureLoader` in `Court.js` / `Neighborhood.js` in place of the canvas textures, keeping `repeat` in world units. Keep the procedural versions as the fallback.
4. **Kenney props** (CC0, https://kenney.nl/assets): street furniture such as bins and barriers can be added to `Neighborhood.js` as instanced GLBs.
5. **Recorded audio** — freesound.org CC0 recordings: decode them into the same buffer names in `AudioSystem` (`kickHard`, `fence`, `crowdBed`, …) and keep the synthesised versions as fallbacks.
