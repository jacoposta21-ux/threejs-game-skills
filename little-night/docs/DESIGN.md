# LITTLE NIGHT — Design

## Design brief

- **Player promise:** you are two years old, the house is enormous and wrong tonight, and a tiny clockwork firefly is the only light you have.
- **Target feeling:** vulnerable curiosity — wonder at scale, dread of silence, relief at warm light.
- **Primary verb:** *light* (choose where LUMO's limited glow goes).
- **Secondary verbs:** walk, crawl, climb, push/drag, open, pick up, throw, hide, examine.
- **Every 5–30 s:** read the room, decide light vs. darkness, move quietly or quickly, interact with an object that changes the space.
- **Across 1–5 min:** one room-scale puzzle resolves (a path opens, an item is won), and THE HUSH's pressure escalates (patrol → investigation → search → chase).
- **Lose / learn / restart:** THE HUSH catches you (short scare, fade) or shadow hands drag you out of unlit floor. Restart at the most recent checkpoint, a few seconds back, with puzzle progress kept.
- **Reward:** new rooms, LUMO energy, story fragments (drawings, grandfather's notes), melody grows louder.
- **Risk:** light makes you visible from farther away; noise (walking, dropping, doors, clutter) draws THE HUSH; LUMO energy runs out.
- **Better player:** crawls near THE HUSH, dims LUMO at the right moment, parks LUMO as a lure, throws objects to redirect patrols, plans charging trips.
- **Next decision communicated by:** the melody (positional audio), glow-chalk fireflies only visible under LUMO, warm accent lights on interactables, short objective notes, contextual prompts.
- **Non-goals:** combat, gore, inventory management, collectibles for their own sake, voiced dialogue.

## Core loop contract

Player **lights and explores** to **reach the melody** while **THE HUSH, darkness and LUMO's energy** create risk; success gives **new space, story and recharge**, failure **returns you to the last checkpoint with progress kept**.

Proof in code: `InteractionSystem` + `PlayerController` map every verb to keys/touch; objectives are toasted and in pause; `HushAI` perception and `NoiseSystem` start in chapter 1; `CheckpointSystem` reloads within ~2 s.

## Story (original)

Grandpa was a toymaker who lived in the attic workshop. He built LUMO for the child "so the night is never too dark", and a music box that plays his lullaby. Since he passed, the house has grown quiet; tonight, in the storm and blackout, that quiet has a shape: THE HUSH, a tall shadow that holds one long finger to where a mouth should be and swallows sound and light. The melody is the music box calling from wherever the house hides it. Winding it in LUMO's light lets the house hear the lullaby again — THE HUSH kneels, folds, and is only Grandpa's coat on its stand. Power returns. The child falls asleep with LUMO.

Told through: wall drawings, photo frames, Grandpa's notes, LUMO-revealed glow chalk (Grandpa's secret marks), the melody's direction, and three short cinematics (LUMO wakes, the first SHHH, the ending).

## Level plan

### Chapter 1 — The Bedroom (tutorial, warm orange / muted blue)
Start in a low toddler bed during a lightning flash. Bedroom 5.6 × 6.4 m, 2.7 m ceiling; hallway 2.4 m wide beyond the door.
1. Move / look; hop off the bed. Melody begins faintly (positional, from the hallway).
2. A drawer in the dresser glows faintly → **Open** → **Pick up** LUMO → wake cinematic. LUMO at 25 %.
3. Glow-chalk fireflies (visible only in LUMO light) lead to the **Nest** charger on the toy shelf: climb toy box → shelf. Teaches climbing + charging.
4. **Puzzle — Reach the handle:** the door handle is above reach. Push the wheeled toy chest to the door, climb, **Open**.
5. Hallway is pitch dark with shadow hands. **Place LUMO** on wall sconces in sequence to light a safe route (dark-passage tutorial).
6. **First encounter:** THE HUSH climbs the stairs at the hallway's end. Hide (under the bed, in the wardrobe, or crawl behind the laundry basket). It searches by sound and leaves.
7. Crawl into the laundry-chute hatch → slide down to Chapter 2.
Checkpoints: wake, LUMO found, door opened, hallway lit, after encounter.

### Chapter 2 — The Kitchen (advanced, cold blue / desaturated green)
Land in the laundry basket in the utility room. Kitchen 9 × 7.5 m, pantry 3 × 3 m (east), hallway to the attic ladder (north, via a crawl tunnel behind the pantry).
1. THE HUSH patrols around the island. Spoons and a tin tray on the floor clatter if walked over (noise traps). Hiding: under the dining table, lower cabinet, under the island overhang.
2. **Puzzle — The missing key:** pantry is locked. Push a dining chair to the counter, climb chair → counter, push the bread tin aside, take the key.
3. **Hidden passage:** loose panel under the sink connects the counter run to the pantry side, bypassing the island.
4. **Puzzle — Noise distraction:** THE HUSH stops patrolling and blocks the pantry door. Pick up a toy block or spoon and throw it at the utility room bucket to lure it away.
5. **Dark pantry:** place LUMO on the hanging hooks to light past the shadow-hand floor; push the flour sack to reveal a crawl hole.
6. Take Grandpa's **wind key** from the top shelf (climb crates). The radio melody stops. SHHH. **Chase:** crawl through the tunnel to the hallway, run to the attic ladder, climb.
Checkpoints: arrival, chair placed, key, pantry opened, chase start.

### Chapter 3 — The Attic (final, dark brown / violet / warm amber)
Long attic 14 × 6 m under sloped rafters.
1. Arrival, Nest charger, Grandpa's note. Melody is loud and close.
2. **Puzzle — Broken mechanism:** the clockwork gate to the workshop needs a **gear** (workbench drawer), a **spring** (toy trunk in the dark toy graveyard; LUMO perches needed) and a **crank** (on top of stacked boxes; climb). Install all three.
3. THE HUSH hunts the attic: patrols the central walk, searches sheet-covered furniture; LUMO lure posts and thrown toys work.
4. **Puzzle — The attic lock:** push the trunk along to reach Grandpa's magic-lantern projector, place LUMO inside: it projects three symbols on the gable wall. Set the three dials on the music box cage.
5. **Finale:** wind the music box with the wind key; THE HUSH comes; place LUMO on the music box crown. Lullaby + light — THE HUSH kneels and becomes a coat on a stand. Power returns. Ending and credits.
Checkpoints: arrival, mechanism parts, gate opened, projector, finale.

## Tuning (initial)
| Value | Setting |
| --- | --- |
| Camera height stand / crawl | 0.78 m / 0.36 m |
| Walk / crawl speed | 2.1 / 1.0 m/s |
| Climb reach | 0.25–1.05 m ledge |
| Noise radius walk / crawl / drop / door / clutter | 4.5 / 1.2 / 11 / 6 / 8 m |
| HUSH speed patrol / investigate / chase | 0.9 / 1.3 / 1.9 m/s |
| HUSH sight | 7.5 m, ×0.55 crawling, +3.5 when LUMO glows near player, ×0.7 in darkness |
| LUMO drain glow / placed | 0.9 / 0.55 % per second, recharge 30 %/s at a Nest |
