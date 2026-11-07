# Vista Mar — Coastal Nights

An original third-person open-world game about a fictional tropical coastal city. It runs in the browser with Three.js and WebGL.
All five phases are complete: **1** playable foundation, **2** vehicles, **3** living city, **4** gameplay (police, missions, money, places) and **5** visual polish.

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
| E | Interact (pick up tapes) / enter vehicle / take a stopped traffic car |
| F | Exit vehicle |
| W / S (driving) | Accelerate · brake, then reverse |
| A / D (driving) | Steer |
| Space (driving) | Handbrake (drift) |
| L / H (driving) | Headlights · horn (siren toggle in police cars) |
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

## What's in Phase 2

- **Vehicles:** ten drivable cars across six classes: Vapor GT sports car, Coastline Sedan, Ranger SUV, VMPD Interceptor police car, Sunshine Cab and a Box Delivery Truck. They use the CC0 Kenney models, with wheels that spin and steer.
- **Driving physics:** arcade physics with an engine curve, top speed, braking then reverse, steering that needs less lock at speed, and a yaw rate capped by tyre grip. Lateral grip lets the car slide, so the handbrake drifts. Suspension follows the terrain and the body dips, squats and rolls with acceleration, braking and cornering.
- **Collisions and damage:** cars collide with buildings, palms, poles, parked cars and other drivable cars, with momentum transfer between cars. Impact damage darkens the body and makes it smoke. At 0% the car is wrecked and the engine dies.
- **Lights:** headlights with a real spot beam on the player's car, brake lights, reverse lights, and a police light bar with siren.
- **Getting in and out:** press E near a car and the driver sits in it, playing the Driving_Loop clip. Press F to get out on the driver's side, or the other side if that one is blocked.
- **Driving camera:** a chase camera that recentres behind the car when you stop moving the mouse, pulls back and widens the FOV with speed, avoids walls and shakes on impacts.
- **Vehicle HUD:** speedometer dial, gear, condition bar and lights, brake, drift and siren indicators. Nearby cars appear on the minimap.
- **Audio:** procedural engine with a gearbox model, tyre skid, crash, door, horn and siren sounds.
- Tapes are collected automatically when you drive through them.

## What's in Phase 3

- **Pedestrians:** nine Quaternius outfits, each with a per-person tint and height. Each pedestrian is collapsed into one skinned mesh (one draw call). The Universal Animation Library clips are baked onto each outfit's skeleton at load, so pedestrians use plain AnimationMixers.
- **Pedestrian AI:** a state machine with IDLE, WALKING, WAITING, CROSSING, FLEEING, INTERACTING and KNOCKED. Pedestrians walk a sidewalk graph of block corners and signalised crossings, and cross only on the walk phase. They pause at shop windows, chat in pairs, and get startled when you bump into them. They flee from a speeding car heading at them or from your horn, and get knocked down when hit, while people nearby panic.
- **Daily routine:** pedestrian density changes by district and hour. Neon Mile is busier at night, the beach and parks in the day, and the streets empty out between 1 and 5 am.
- **Traffic:** right-hand lanes. Cars stop at red lights and take Bezier turns (straight, left or right) at intersections. They keep a gap to cars, pedestrians and the player, and honk when you block them. Speed limits depend on the district. Cars spawn and despawn around the player with a density set by district and time. Rendering uses instanced pools with head and tail lamps that light up at night.
- **Interactions:** ramming a traffic car turns it into a physical, drivable vehicle. Pressing E next to a stopped traffic car pulls the driver out, who runs away, and you drive off.
- **Performance:** distance-based animation update rates and shadow casting, pooled pedestrians, and meshopt-compressed models (all assets about 4 MB).

## What's in Phase 4

- **Wanted system:** five stars. Hitting pedestrians, carjacking, reckless crashes near police, ramming a police car, stealing a police car and setting off car alarms all raise the level. Long pursuits escalate it further. The stars flash while the police search for you.
- **Police response by level:** 1 unit investigates your last known position (★), units pursue (★★), more units drive ahead of you to intercept (★★★), roadblocks across the road ahead (★★★★), and the maximum response (★★★★★). Police drive real vehicles routed over the street graph and switch to direct pursuit when they have line of sight.
- **Escaping:** break line of sight, then stay hidden outside the search area shown on the radar for long enough. Crouching on foot hides you faster. You can also respray at Spray & Go while unseen.
- **Busted and wasted:** staying stopped next to a police car gets you **BUSTED** (10% fine, released at police headquarters). Losing all your health gets you **WASTED** (hospital bill). You lose health from crashes and from being run over. It regenerates slowly when you are out of danger, and food carts restore it.
- **Missions:** a reusable framework in `MissionManager` with steps, timers, waypoints, GPS route, pass/fail banners and rewards.
  - *MISSION 01 — The Delivery*: walk to Rico's marker, take the box truck, deliver the package to Port Industrial within 2:30 without wrecking the cargo, and get $3,000 plus a condition bonus. It fails if the van is destroyed, the cargo drops below 35%, you abandon the van or time runs out.
  - *MISSION 02 — Joyride*: unlocks after Mission 01. Steal the alarmed GT on Ocean Drive (2 stars), lose the cops, and deliver the car to the Spray & Go garage for $5,000 plus a bonus.
- **Interactive places:** a safehouse (save the game and sleep until 08:00, loaded automatically on Play), a gas station (repair, $150), Spray & Go (repair, repaint and lose the cops, $400) and four food carts (+50 health). All of them appear on the radar.

## What's in Phase 5 (visual polish)

- **Buildings:** procedural normal maps generated from each facade's window layout. Windows are recessed with raised frames, sills, floor bands and brick mortar, so the lighting picks out depth. Bus stop shelters with illuminated ad panels line the main avenues.
- **Roads:** fine asphalt-grain normals. After dark the streets take on a humid sheen that reflects lights.
- **Vehicles:** clear-coated metallic paint (MeshPhysicalMaterial) on drivable, parked and traffic cars, reflecting the sky. Sliding or braking hard leaves skid marks on the road with tyre smoke.
- **Vegetation:** palms, trees and bushes sway in the wind (a vertex shader with a per-instance phase), and their shadows sway with them.
- **Atmosphere:** seagull flocks over the beach, a sun lens flare at golden hour, an ocean with two independent wave layers (normal map plus clearcoat normal), and a moon only after dark.
- **Post-processing:** a colour grade (saturation, gentle S-curve, teal-shadow/warm-highlight split toning that warms at golden hour and turns cool magenta at night) and a vignette. SMAA anti-aliasing runs when MSAA is off (Low and Medium).
- **Character:** the player leans into turns while running.
- Ambient occlusion (GTAO) was considered and left out. It re-renders the whole scene for normals and depth, which would roughly double the draw calls.

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
  world/Effects.js            wind sway, car paint, seagulls, sun flare, skid marks, grade pass
  world/World.js             sky shader, sun/moon, fog, ocean, env map, night lighting, signals
  player/CharacterRig.js     runtime animation retargeting
  player/PlayerController.js movement, stamina, jump/crouch, animation state
  camera/CameraController.js third-person camera
  systems/CollisionSystem.js spatial hash collision + camera ray cast
  systems/MissionSystem.js   activity/mission framework + Lost Tapes
  systems/PoliceSystem.js     wanted levels, police AI, roadblocks, busted
  systems/RoadGraph.js        street graph routing (GPS + police)
  systems/Locations.js        safehouse, repair, respray, food
  missions/MissionManager.js  reusable mission framework
  missions/missions.js        Mission 01 and 02 scripts
  npc/NPCSystem.js             pedestrian graph, state machine, reactions, pooling
  npc/AnimBaker.js             bakes UAL clips onto each outfit's skeleton
  traffic/TrafficSystem.js     lanes, signals, turns, gap keeping, instanced cars
  vehicles/Vehicle.js           vehicle model, physics, collisions, damage, lights
  vehicles/VehicleSystem.js     spawning, idle physics, pedestrian push-out, smoke, headlight beam
  vehicles/VehicleController.js enter/exit and player driving input
  vehicles/VehicleTypes.js      handling specs and spawn points
  ui/HUD.js, ui/Minimap.js, ui/Menus.js
  audio/AudioManager.js
```

Performance: static geometry is merged by material within 200 m chunks, which are frustum- and distance-culled. Repeated props (palms, trees, lamps, cars, benches and more) are instanced. Materials and textures are cached and shared, the shadow camera is snapped to texels, and graphics presets scale pixel ratio, shadow resolution, bloom and MSAA.

## Credits

3D models: [Quaternius](https://quaternius.com) and [Kenney](https://kenney.nl), all CC0. See `public/assets/LICENSES.md`. Everything else, including textures, buildings, sky, audio and UI, is generated by the game's code.

## Renderer budget (measured, Low preset, 1280×720)

| Scene | Draw calls | Triangles |
| --- | --- | --- |
| Palm Boulevard at golden hour | 731 | 1.45 M |
| Downtown intersection by day | 458 | 1.06 M |
| Neon Mile at night | 479 | 1.32 M |
| Beach at sunset | 265 | 0.84 M |
| Drift on Ocean Drive | 836 | 1.22 M |

Counts include the shadow pass. Long sightlines down the palm-lined boulevard are the most expensive views. The levers are the per-chunk LOD distances in `CityGenerator.buildInstances`, `MAX_NPCS` and the traffic pool size. These numbers come from headless Chromium using SwiftShader (software rendering), so frame rates on a real GPU were not measured here. The canvas inspector's 10 s preparation deadline is also shorter than the software-rendered load, so its pixel metrics could not be captured in this environment.
