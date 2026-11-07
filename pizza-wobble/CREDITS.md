# Credits

## Code-generated (procedural) assets — no external files
All 3D content is generated in code at runtime: buildings (walls, cornices, gable/hip/flat
roofs, windows with shutters, balconies with geraniums, arched doors), scooter and rider,
pizza boxes, cars, Ape three-wheelers, parked Vespa-style scooters, customers, pigeons, gulls,
boats, lighthouse, lamps, café tables and umbrellas, fountains, cypresses, olive trees,
laundry lines, string lights. Textures (cobbles, stone slabs, asphalt, grass, roof tiles,
box logo, pizza, pizzeria sign, particle sprites) are painted on `<canvas>` at runtime.
Sound effects are synthesised with the Web Audio API (no audio files).

No CC0 model packs were downloaded: the procedural kit was chosen so every surface shares
one palette and material language. No trademarks, real logos or existing characters are used;
"Pizzeria Wobble" and the box logo are invented.

| Asset | Source | License |
|---|---|---|
| Fredoka font (weights 500, 700, latin subset, woff2) | Fredoka Project Authors, via the `@fontsource/fredoka` npm tarball (extracted, not a dependency) | SIL Open Font License 1.1 — `src/assets/fonts/OFL.txt` |
| All other art and audio | Generated in code (this repository) | Same as the project |

Note: the font is not CC0 (fonts are not among the model/character/prop assets restricted to
CC0); OFL 1.1 allows bundling it in a commercial web game.

## Libraries
three.js (MIT), @dimforge/rapier3d-compat (Apache-2.0), postprocessing by pmndrs (Zlib).
