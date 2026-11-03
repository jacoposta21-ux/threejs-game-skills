# Grim Acres 3D

A 3D port of **Grim Acres**, the cozy autumn farming game with a murder-mystery twist
(someone in Mildew Hollow keeps turning villagers into garden gnomes).

The game rules, story, save format, UI, audio and the six translations are the original ones;
the 2D pixel canvas renderer was replaced by a Three.js renderer.

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5188
npm run build    # static build in dist/ (relative paths, ready for any static host)
```

**No install needed:** open `standalone/grim-acres-3d.html` with a double-click. It is a single
self-contained file (rebuild it with `npm run standalone`). Opening `index.html` directly does
not work: it needs `npm run dev` or a built `dist/` served over http.

Controls are unchanged: WASD/arrows move, E/Space interacts, 1–5 or the mouse wheel pick a
hotbar slot, Tab/N notebook, I/B bag, Esc pause. Touch devices get the virtual joystick and the
action button; gamepads work too.

## Publishing builds

```bash
npm run build:crazygames   # dist-crazygames/  CrazyGames SDK v3 (loading, gameplay, happytime, cloud data)
npm run build:playgama     # dist-playgama/    Playgama Bridge 2.4 bundled locally (game_ready, gameplay
                           #                   start/stop, cloud saves, platform language, pause/audio events)
```

Zip the *contents* of the folder (so `index.html` is at the root of the archive) and upload it.
The Playgama build swaps `js/platform.js` for `js/platform-playgama.js` at build time; the game code
is otherwise identical.

## What changed for 3D

| File | Role |
| --- | --- |
| `js/renderer.js` | New Three.js renderer: same interface as the old 2D one (`resize`, `snap`, `updateCamera`, `render`, `arrowPos`) plus `toScreen()` for HTML overlays. |
| `js/three/kit.js` | Small low-poly modelling kit (vertex-coloured primitives merged into one draw call per model) and a pixel-sprite voxelizer used as fallback. |
| `js/three/models.js` | Procedural models: 9 buildings, trees, crops at every growth stage, field debris, ~45 props and furniture, gnome statues, the chibi villager rig (walk cycle, hats, hair, beards, glasses, the hooded prowler disguise) and cats. |
| `js/ui.js` | Speech bubbles, door labels and the objective label are now placed by projecting 3D positions. |
| `assets/style.css` | Full-resolution canvas and the off-screen objective pointer. |

Rendering notes:

- 1 tile = 1 world unit. The camera looks north at a fixed angle, so the original 4-way movement
  maps 1:1 to the screen. Outdoors it follows the player and clamps to the map; indoors it frames
  the whole room.
- The ground keeps the original pixel-art tiles as a nearest-filtered texture atlas; the river is
  sunk below the banks. Trees, bushes and rocks are instanced.
- Day/night: the sun arcs across the sky with real shadows, dusk turns warm, at night the street
  lamps, windows and room lights glow (bloom), and the player carries a small lantern. Rain and
  cloudy days dim the light and fog; rain falls as streaks.
- Buildings between the camera and the player fade out so you never lose your farmer.
- `?debug` in the URL exposes `window.__grim = { game, ui, renderer }` for testing.
