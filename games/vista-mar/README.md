# Vista Mar — Coastal Nights

An original third-person open-world game about a fictional tropical coastal city. It runs in the browser with Three.js and WebGL.
**Phase 1 (playable foundation)** is complete. Vehicles, traffic, police and missions are the next phases.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5188
```

Other commands:

```bash
npm run build          # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/ (models embedded)
npm run verify:visual  # headless playtest: captures + real-input checks in artifacts/playtest/
```

Append `?quality=low|medium|high` to the URL to force a graphics preset.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move (relative to the camera) |
| Mouse / arrow keys | Rotate camera (click the game to capture the mouse) |
| Mouse wheel | Camera distance |
| Shift | Sprint (uses stamina) |
| Q | Toggle walk / run |
| Space | Jump |
| C | Crouch |
| E | Interact (pick up tapes) |
| M | City map |
| Esc | Pause menu (Resume, Settings, Controls, Restart) |

If the browser frame can't capture the mouse (some embedded previews), hold the left mouse button and drag to look.

## What's in Phase 1

- **City of Vista Mar:** 8×8 blocks over about 1 km² and seven districts. Downtown has setback glass towers and a 205 m landmark tower. Midtown has shopping streets with awnings. The Neon Mile nightlife strip has neon signs and roof strips. Ocean Drive has Art Deco hotels and pools. There's a beach with lifeguard towers, umbrellas and an ocean. The Palm Heights residential district has houses with gable roofs, driveways and pools. Coral Gables has apartments. Port Industrial has warehouses, container stacks and chimneys. There are also two parks, a central plaza, a gas station and a parking lot. Palm Boulevard is a divided avenue with a planted median.
- **Lighting:** day/night cycle with a custom sky (gradient, sun, moon, stars, moving clouds), golden hour and sunset, fog that matches the horizon, soft shadows that follow the player, and reflections from a sky environment map refreshed as the sun moves. At night, windows, shop fronts, neon signs and streetlights light up, with glowing light pools on the ground, bloom, red beacons on the towers and working traffic signals.
- **Player:** a Quaternius character animated with 46 clips from the Universal Animation Library. The clips are retargeted at runtime by `CharacterRig`. The player can idle, walk, jog, sprint, crouch and jump (start, loop and land). Movement is relative to the camera, with acceleration, turn smoothing, coyote time, jump buffering, stamina and footsteps that change with the surface.
- **Camera:** orbiting third-person camera with shoulder offset, smooth follow, wheel zoom, collision pull-in against buildings and an FOV kick when sprinting.
- **Collision:** spatial-hash boxes and cylinders for buildings, palms, poles, benches, parked cars and containers. Low obstacles can be stood on and curbs are stepped onto automatically. Invisible walls bound the world.
- **HUD:** circular minimap that rotates with the camera and shows roads, buildings, the nearest objective at its edge and north. Health and stamina bars, money counter, clock, wanted stars, objective panel, district banner, street names, interaction prompt and notifications. There's a full city map (M) and a pause menu with working settings: quality, sensitivity, invert Y, camera distance, FOV, volume, day length, time of day and an FPS counter.
- **Activity:** *Lost Tapes*. Twelve mixtapes are hidden around the districts, each marked by a pink light beam. Each is worth $500, with a $5,000 bonus for finding them all. It runs on `MissionSystem`, which Phase 4 missions will reuse.
- **Audio:** all procedural Web Audio, with no files. It covers city ambience, ocean surf by distance, distant traffic, night crickets in green areas, footsteps per surface, jump and land sounds, pickup and reward chimes and UI clicks.

## Architecture

```
src/
  main.js                    entry, WebGL check, fatal-error screen
  core/Game.js               single animation loop, states, post-processing, quality, test hooks
  core/InputManager.js       keyboard, pointer lock, drag-to-look fallback
  core/AssetLoader.js        CC0 model loading + static mesh baking for instancing
  world/Layout.js            city plan (roads, blocks, districts, terrain height)
  world/CityGenerator.js     buildings/roads/props → merged meshes per (chunk, material) + InstancedMesh props
  world/GeoBuilder.js        geometry accumulation with world-scaled UVs
  world/textures.js          procedural canvas textures (facades, roads, neon atlas, …)
  world/World.js             sky shader, sun/moon, fog, ocean, env map, night lighting, signals
  player/CharacterRig.js     runtime animation retargeting
  player/PlayerController.js movement, stamina, jump/crouch, animation state
  camera/CameraController.js third-person camera
  systems/CollisionSystem.js spatial hash collision + camera ray cast
  systems/MissionSystem.js   activity/mission framework + Lost Tapes
  ui/HUD.js, ui/Minimap.js, ui/Menus.js
  audio/AudioManager.js
```

Performance: static geometry is merged by material within 200 m chunks, which are frustum- and distance-culled. Repeated props (palms, trees, lamps, cars, benches and more) are instanced. Materials and textures are cached and shared, the shadow camera is snapped to texels, and graphics presets scale pixel ratio, shadow resolution, bloom and MSAA.

## Credits

3D models: [Quaternius](https://quaternius.com) and [Kenney](https://kenney.nl), all CC0. See `public/assets/LICENSES.md`. Everything else, including textures, buildings, sky, audio and UI, is generated by the game's code.
