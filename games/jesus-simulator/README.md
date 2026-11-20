# ✝ Jesus Simulator — The Holy Open World Experience

A humorous, Roblox-inspired, GTA-style open-world sandbox set in first-century Galilee. Built with Three.js, Rapier 3D and Vite as plain JavaScript ES modules. **This release is single-player only.**

> Status: **All 7 phases are complete**: playable foundation, living world, miracles, the Roman system, the open world with rides, the Ministry (missions, followers, Faith/Chaos, Blessings, full save), and polish (regional music, a host-platform layer prepared for the CrazyGames SDK). The game has **not** been submitted to CrazyGames. See [Roadmap](#roadmap).

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5188
```

Production build + local preview (the build uses a relative base, so `dist/` works from any static host or iframe sub-path):

```bash
npm run build
npm run preview    # http://127.0.0.1:4188
```

A single self-contained HTML file (everything inlined, opens with a double-click, no server):

```bash
npm run build:single   # dist-single/jesus-simulator.html (~5 MB)
```

Checks (need the preview server running):

```bash
npm run test:play      # real-input playtest: Phases 1-6 (movement, saves, NPCs, miracles, Romans, riding, regions, wildlife, missions, followers)
npm run test:motion    # locomotion video + contact sheet
npm run test:npc-motion    # villager life contact sheet
npm run test:roman-motion  # legionaries chasing + a Divine Push ragdoll, contact sheet
npm run test:platform  # host-platform layer with a test-only SDK double + regional music
npm run verify:visual  # canvas inspector over the states in artifacts/evidence.json
```

If Playwright can't find a browser, point it at an installed Chromium with `CHROMIUM_PATH=/path/to/chromium`.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move (camera-relative) |
| Mouse (click the game to capture it) | Rotate camera · arrow keys also turn it |
| Shift | Sprint |
| Space | Jump (hold for higher) |
| E | Talk to villagers · interact with signs, the well, the olive press… |
| 1 / 2 / 3 (in a conversation) | Choose an answer · Esc leaves the conversation |
| Mouse wheel | Camera distance |
| Right mouse | Shoulder aim view |
| 1–6 | Select a miracle |
| Left mouse **or Q** | Cast the selected miracle (hold to keep lifting with Levitation; hold to keep multiplying) |
| E (near a legionary, when not wanted) | Talk to the Romans |
| F | Get on / get off a ride (donkey, horse, camel, cart, chariot) |
| W / S · A / D (riding) | Pace (trot, back up) · steer |
| Shift · Space (riding) | Gallop · hop (animals) |
| G | Followers: wait here / come with me |
| Tab | Map |
| Esc | Pause menu |

### Touch (phones and tablets)

Touch controls switch on by themselves on a touch screen (a coarse pointer). `?touch=1` forces them on and `?touch=0` off. They feed the same intents as the keyboard and mouse (`src/core/TouchControls.js` writes into `Input`).

| Touch | Action |
| --- | --- |
| Left thumb, anywhere on the left part of the screen | Floating joystick: move · push past the ring to sprint (gallop when riding) |
| Drag anywhere else | Look around · two-finger pinch zooms |
| Big gold button | Use the selected miracle (hold to keep lifting / multiplying) |
| Arrow button | Jump (hold for higher) |
| Speech button (glows when someone or something is near) | Talk / interact · the prompt itself is tappable too |
| Horse button (shown by a ride or while riding) | Get on / get off |
| People button (shown with followers) | Followers: wait / follow |
| Hotbar | Tap a miracle to select it |
| Pause / map buttons (top) | Pause menu / map · ✕ closes the map |
| Conversation | Tap an answer · ✕ leaves · tap the panel to continue |

The HUD regroups around the thumbs: objective, Faith/Chaos, followers and the riding panel stack top-left; minimap top-right; the hotbar sits between the thumbs (above them when the phone is upright). Phones held upright get a wider field of view. Phones start on the Low graphics preset and tablets on Medium.

## What Phase 7 adds — polish, music and the host platform

- **Platform layer** (`src/platform/Platform.js`): the game talks to one `platform` object, which talks to the host.
  - **CrazyGames SDK v3** is loaded from the SDK's own URL **only** when the game is hosted on CrazyGames (a crazygames hostname or referrer), or when the URL has `?crazygames=1` (to test with the SDK's local mode). Otherwise a local platform is used where every call is a no-op. **There are no ads of any kind outside the host SDK, and nothing in the game imitates an ad.**
  - **Loading:** `loadingStart` when booting and `loadingStop` when the menu is ready.
  - **Gameplay:** `gameplayStart` only while actually playing; `gameplayStop` in the menu, pause, map, arrest card and during ads. State changes only, never repeated calls.
  - **Happy moments:** `happytime` on mission, chapter and circus-record completion.
  - **Mute:** the host's mute setting (`muteAudio` plus its change listener) mutes the game.
  - **Saves:** stored in the host's data module when present; an existing local save is carried over once.
  - **Ads:**
    - A **midgame** ad only at natural breaks: when released after an arrest, and when continuing from the main menu. At most once per 3 minutes of actual play, and never in the first 3 minutes. The game is paused and muted while it plays.
    - An optional **rewarded** ad ("Ask for a sign", Faith +10) in Pause → Miracles, shown only when the host supports ads.
  - **Safety:** every SDK call is feature-checked and wrapped, so a missing or failing SDK can't break the game, and an ad whose callbacks never arrive releases the game after 90 s.
- **Music by region:** the procedural score changes with the region — scale, voice, pacing and wind level.
  - **Nazareth:** lyre (pentatonic).
  - **Countryside:** flute.
  - **Sea of Galilee:** bells.
  - **Roman outpost:** horn with drum taps (minor).
  - **Desert:** an oud-like voice over a drone (Phrygian dominant).
- **Polish:**
  - An *About & credits* sheet in the menu (v1.0, all assets procedural).
  - Loading tips; the loading bar no longer overflows with the larger world.
  - Phones and tablets start on Medium quality on first launch (the automatic downgrade still handles weak desktops).

### Publishing on CrazyGames (status)
The integration is prepared but **the game has not been submitted to CrazyGames, and nothing here implies CrazyGames approval.** The SDK documentation and script hosts couldn't be reached from the build environment, so the adapter follows SDK v3 as known at the time of writing. Before submitting:
1. Check the method names against the current CrazyGames docs.
2. Test with `?crazygames=1` and the CrazyGames QA tool.
3. Upload the `dist/` folder.

The relative-base build works from any sub-path.

## What Phase 6 adds — the Ministry: missions, followers, Faith and Chaos

- **Chapter III: The Ministry — 6 missions** run by a data-driven `MissionManager`.
  - **How a mission starts:** anyone with a mission shows a bobbing gold **!** over their head and on the maps. Talk to them (E) and pick the ★ option.
  - **Tracking:** the objective card shows the current step with distance and direction, and a gold star marks it on the minimap and the map. A ★ option appears in the conversation with whoever you need to talk to next.
  - **The Wedding Wine** (Mary): Cousin Nathan's feast east of the square has run out of wine. Go to the canopy, turn the water in the six stone jars into wine, then tell the bridegroom. Faith +15, Chaos −3.
  - **Fishers of Men** (Simon): go to the end of the hamlet jetty and walk out onto the deep water. The lake boils with fish. Tell Simon and he leaves his nets to follow you.
  - **The Wandering Donkey** (Bartholomew, at the farm): his donkey has run off to the Palm Oasis. Find her and ride her home. Bartholomew follows you.
  - **Bread for the Caravan** (Hiram, at the camp): one loaf, six hungry travellers. Use Multiplication until everyone has eaten.
  - **The Centurion's Servant** (Gaius Grumpus): he comes to the camp gate to ask, so you don't have to trespass. His seal lets you into Castra Galilaea; heal his servant Philo there. Reward: *Centurion's Favour* — soldiers see 15% less far and arrest fines are halved.
  - **The Lost Sheep** (Amos): the Phase 2 errand, now tracked as a mission.
  - Finishing all six completes Chapter III (Faith +20).
- **New people:** Bartholomew the farmer, Hiram the caravan master, six hungry travellers, Philo the centurion's servant, and Nathan the bridegroom. They have their own dialogue and stay at their posts day and night.
- **Followers (up to twelve):**
  - **Recruiting:** finish Simon's and Bartholomew's missions, heal someone long-suffering (Benjamin's knee, the sprained ankle), or, once your Faith reaches 25, simply say "Come, follow me" to almost anyone.
  - **Following:** they walk, jog or run to keep a loose formation behind you. If you ride or walk off far, they rejoin out of sight.
  - **Orders:** **G** makes them wait or calls them back; you can also tell one of them in conversation.
  - **Faith:** they bring Faith over time (+1 per follower every 90 s).
- **Faith and Chaos with consequences:**
  - A HUD pill shows your title, Faith and Chaos.
  - **Titles** come from the Faith you have ever earned: Joseph's son → Wandering teacher → Miracle worker → Prophet of Galilee → …
  - **Chaos tiers:**
    - *Restless* (12+): villagers are wary.
    - *Notorious* (30+): people back away from you and the legion watches 20% more closely.
  - Chaos fades slowly, and faster with healing and missions.
- **Blessings:** spend Faith on miracle upgrades in Pause → Miracles. Each miracle has 2 levels (15 / 30 Faith), and every level also cuts its cooldown by 20%.
  - **Divine Push:** wider reach.
  - **Multiplication:** more loaves per cast.
  - **Water to Wine:** lasts longer.
  - **Walk on Water:** more time on the lake.
  - **Healing Touch:** at level 2, healing spreads to everyone hurt nearby.
  - **Holy Levitation:** longer range.
- **Full save (version 2):** stores mission states and the tracked mission, followers (and who is waiting), Blessings, perks and passes, and rides parked away from home. Version 1 saves from Phases 1–5 still load; the new systems start empty.
- **Journal:** the Missions tab starts with Chapter III: every mission's state, its next step or its reward, and your followers by name. Statistics add reputation, missions done and Blessings.

## What Phase 5 adds — Galilee and things to ride

The whole 408 × 408 m map is now open (a square boundary at ±204 m). Four regions surround the Nazareth valley, each with two places to discover — **Chapter II: Explore Galilee** (8 places; the objective card switches to it once Chapter I is done, and shows the compass direction of the nearest one).

- **Countryside (west):**
  - **Bar-Tolmai Farmstead:** a walled farmyard with a farmhouse, a stable shed, a threshing floor and roller, haystacks, a well, a goat pen and terraced vineyards. Two wheat fields of instanced stalks lie along the road.
  - **Goat Hill:** a 9 m hill with a summit cairn, a round herder's hut and boulders. Goats roam it and scatter, bleating, when you run at them.
- **Sea of Galilee (east):** the whole lake is open.
  - **Fishers' Hamlet:** on the north shore, with four huts, a 21 m jetty, moored and beached boats, drying nets, fish baskets and a campfire.
  - **The Lonely Isle:** in the middle of the lake, with a palm, a fig tree and an inscribed stone. It's only reachable by walking on water.
  - Fish leap out of the lake near you.
- **Roman outpost (north):**
  - **Castra Galilaea:** a stone fort with crenellated walls, six towers, a gate with SPQR banners, barracks, a column-fronted HQ with the eagle standard, a granary, a training yard and a stable. The interior is a restricted military area, like the checkpoint camp.
  - **The Little Circus:** a dusty chariot track with a spina, gilded turning posts, an obelisk, a fence and wooden stands.
  - Four more legionaries are posted at the fort: two gate guards, a stable guard and a tower lookout (12 on duty in total).
- **Desert (south):** sand dunes replace the hills, with dry shrubs, lone palms, a sandstone arch and mesas on the skyline.
  - **Palm Oasis:** a pond ringed by palms and reeds. You can wade in it, and **Water to Wine works on it**.
  - **Caravan Camp:** striped tents, carpets, trade goods and a campfire, with camels resting. Three more camels walk a caravan loop between the camp and the oasis.
- **Rides (F):** ten rides in total, all simulated with Rapier's character controller (an arcade model with a cuboid collider).
  - **The rides:** Joseph's donkey right by the start; the farm donkey, a donkey cart and an old mare at the farm; a fish cart at the hamlet; two legion horses and two **Roman chariots** at the fort; and a camel at the caravan camp.
  - **Controls:** W trots, Shift gallops, S brakes and backs up, A/D steer (animals can turn on the spot, wheels need speed), and Space hops on animals.
  - **Feel:** legs swing in walk, trot and gallop gaits, wheels spin, and rides tilt to follow slopes. The camera pulls back and swings in behind you. The rider sits astride a saddle, on a cart bench, or stands in the chariot.
  - **Limits:** rides refuse deep water and stop at the edge of the map. A ride left far from home goes back on its own after a while, when nobody's looking.
- **Riding into trouble:**
  - **Trampling:** galloping into a villager knocks them down or sends them flying as a ragdoll; if a soldier sees it, that's *Trampling a citizen*. Ride into a legionary and he goes flying (assault).
  - **Theft:** a legion horse that a soldier sees you on is *Stealing a legion horse* (at least 1★). A Roman chariot is *Stealing a Roman chariot* (at least 2★).
  - **Pulled off:** a legionary who gets a grip on you drags you off your ride.
  - **Escaping:** a galloping horse is the fastest way to break line of sight.
- **The Little Circus lap:** ride once around the spina and back through the white line on any animal. The lap timer shows in the riding panel, and the best lap is saved. Your first lap and each new record earn Faith.
- **Wildlife:** 8 goats, 6 camels (resting and in a caravan), flocks of doves, gulls, farm birds and desert kites circling, pigeons on the town square that burst into the air when you approach, and fish leaping in the lake. Birds and fish are two instanced meshes, with wing flapping done in the vertex shader.
- **Map and HUD:**
  - The minimap and the world map cover all of Galilee, with region names lettered on the parchment and rides shown as triangles (red for Roman property).
  - **Region labels:** Bar-Tolmai Farm, Goat Hill, Fishers' Hamlet, Castra Galilaea, The Little Circus, Palm Oasis, Caravan Camp, The Desert, and others.
  - A riding panel shows the name, gait bar, lap timer and keys, and an F prompt appears next to the E prompt.
- **Audio:** procedural donkey brays, horse whinnies, camel grumbles, goat bleats, hoof clops for each gait, wheel rumble and pigeon wing flutters.
- **Saving:** rides taken, distance ridden, chariots "borrowed", circus laps and best lap are saved and shown in Statistics. Chapter II progress shows in the Missions tab. You always load in on foot, with every ride back at home.

## What Phase 4 adds — the Roman system

A `RomanManager` (`src/roman/`) owns the garrison, their perception, the **Roman Attention** wanted level, pursuit, search, arrests and reinforcements. A generic `RagdollSystem` (`src/physics/Ragdoll.js`) turns any CharacterKit rig into a Rapier ragdoll. Everything talks through the event bus (`roman:crime`, `roman:wanted`, `roman:lost`, `roman:arrest`, `roman:ragdoll`, `player:arrested`, …).

- **The Roman checkpoint** on the north road (≈110 m from the square): a palisade camp with a gate, a lookout tower, tents, a campfire, a command tent, the legion standard, a weapon rack, a road barrier and a guard booth. The compound is a **restricted military area**. It shows on the minimap and the world map.
- **The garrison — 8 legionaries plus 6 in reserve.** They're built on the villagers' CharacterKit with a galea helmet and crest, lorica segmentata, a scutum and a pilum; Centurion Gaius Grumpus gets a transverse crest, medals and a cape.
  - **Patrols:** a pair walks the north road into the square, one soldier loops the east lanes and one the west lanes.
  - **Posts:** guards stand at the road barrier and the camp gate, a lookout watches from the tower, and the centurion holds the camp.
  - **Talking:** soldiers greet Jesus, grumble about their feet and can be talked to (E).
- **Perception:**
  - Each soldier has a view cone (115°, 24 m by day, 62 % of that at night; the tower lookout sees 46 m) and slowly sweeps it while on post.
  - Line of sight is a Rapier ray against architecture and terrain, so houses and hills hide you; trunks don't.
  - Within 3.5 m they notice you regardless of where they're looking.
  - The red cones on the minimap show where each soldier is looking.
- **Roman Attention (0–5 stars).** Only crimes a soldier saw (or a crime against a soldier) count. They include:
  - knocking people over, smashing pots and blasting citizens with Divine Push;
  - levitating people ("suspicious sorcery") and unlicensed bread distribution;
  - jostling, shoving, pushing or levitating a legionary;
  - trespassing in the camp — after a shouted warning.

  Loud crimes nobody saw bring soldiers to investigate, and a villager may shout "GUARDS!".
- **Pursuit:** the soldiers who saw it give chase, running faster as the stars rise.
  - **They cut you off:** they lead the target, use straight lines when the way is clear and the navigation graph otherwise.
  - **2 stars:** the horn sounds and every soldier within ~95 m joins in.
  - **3 stars:** reinforcements arrive out of view, ahead of you, from 2 up to 6. At 4 stars the centurion joins.
  - **Around them:** villagers react as the chase passes, and the kids cheer "RUN, YESHUA!". Pursuit drums replace the lyre.
- **Escaping:** break line of sight and stay out of sight. The stars flash and a bar runs down (6 s + 3 s per star) until the search is called off. Soldiers search around your last known position, then go back to duty.
- **Using miracles:**
  - **Divine Push** sends legionaries flying as **real Rapier ragdolls** (7 bodies, spherical joints) that land, settle and get back up angrier and bruised. Villagers hit hard by the Push ragdoll too.
  - **Healing Touch** on a soldier makes him look the other way: −1 star, once per hunt.
  - **Water to Wine** lures nearby soldiers off for a "tasting".
  - **Levitation** works on soldiers ("PUT ME DOWN, THAT'S AN ORDER!"), but it's a crime.
  - **Romans don't swim:** they stop at the waterline.
- **Seized and arrested:**
  - **Seized:** a soldier within reach grabs you. A "SEIZED!" bar fills and you slow down; run, or push them off, to break free.
  - **Arrested:** if the bar fills you are arrested. An ARRESTED card shows the stars and a fine in Faith; then a few hours pass and you are released at the checkpoint barrier.
  - **What carries over:** the save keeps arrests, escapes, legionaries toppled and the highest attention reached. The wanted level itself does not survive a reload.

## What Phase 3 adds — miracles

A `MiracleManager` owns unlocks, cooldowns, targeting, casting and ongoing effects, and publishes `miracle:cast`, `miracle:reveal` and `miracle:end` events. Each gift is **revealed by discovering a landmark**:

| Key | Miracle | Revealed at | What it does |
| --- | --- | --- | --- |
| 1 | **Divine Push** | Joseph & Son Carpentry | A cone of holy force (7.5 m) with distance and angle falloff. Strong hits topple villagers (they recover) and may bruise them. Props, fruit, bread and chickens fly; pots can break. +Chaos. |
| 2 | **Multiplication** | Nazareth Market | Aim at the bread or fish on the counters (or at a copy) to spawn copies that bounce, roll and collide; holding the button keeps going. Pooled with a **hard cap of 80** (the oldest is recycled with a poof) and a 60 s lifetime. Villagers cheer and fetch free bread (+Faith); a street drowning in bread raises Chaos. |
| 3 | **Water to Wine** | The Town Well | Aim at the well, the trough or a clay jar. The water turns deep red with a swirl of particles. Villagers react in three ways: some celebrate, some walk over curious, some shout for their friends, who come running. +Faith. The well runs clear again after a while. |
| 4 | **Walk on Water** | Shore of Galilee (new 8th landmark) | For 25 s a walkable surface appears over the open lake strip, with ripples at every step. Witnesses gasp (+Faith). If it runs out over deep water you sink and get fished out onto the dock. Without it you can wade into the shallows, but deep water pushes you back. |
| 5 | **Healing Touch** | The Synagogue | Heals injured villagers (Benjamin's old knee, a villager's sprained ankle, anyone bruised by your Push) with a golden column, cheering bystanders and +Faith (+5 for chronic ailments). Healthy people just say thanks. |
| 6 | **Holy Levitation** | Rooftop Lookout | Hold to lift a person or an object about 2.5 m and steer it gently with the crosshair (within 4 m). Release, or wait 7 s, and it is set down safely. Lifted villagers flail and shout "PUT ME DOWN!", then land dizzy. |

Supporting changes:
- **Lake shore:** the explorable area now includes the near shore of the Sea of Galilee, with a dock and a moored fishing boat.
- **Effects and sound:** a pooled VFX system (one particle draw call plus a ring pool), Jesus casting poses and halo glow, and procedural sounds for every miracle.
- **HUD:** a crosshair, a golden marker over the current target, the target or status line ("Heal: Benjamin (bad knee)"), and cooldown sweeps on each slot. Revealed gifts are saved.

## What Phase 2 adds — the living world

- **27 villagers** built from a lightweight blocky character kit. Each body part is one merged mesh with a shared face-atlas material, so a villager costs about 7 draw calls. Six facial expressions (neutral, smile, surprised, angry, talking, sleepy) are swapped through UVs; the mouth flaps while a villager speaks.
  - **Named characters:** Mary, Joseph, Eli the baker, Levi, Tobias, Rachel the potter, Dina, Naomi, Simon the fisherman, Old Hannah, Rabbi Ezra, Amos the shepherd, the kids Sami and Leah, and Yusuf the traveller.
  - **Others:** 10 villagers and 2 extra merchants.
- **Daily routines on a day/night clock:** a 10-minute day runs 06:00–20:00, followed by a short moonlit night.
  - **Merchants:** run their stalls and call out to passers-by.
  - **Joseph:** hammers at his workbench.
  - **Mary:** sweeps the yard and fetches water.
  - **Simon:** walks east toward the lake with his net, then delivers fish.
  - **Amos:** herds his flock.
  - **Ezra:** prays on the synagogue portico.
  - **The kids:** play tag in the square.
  - **Yusuf:** passes through the valley.
  - **In the evening and at night:** villagers sit on benches in the evening, then go home and step inside at night. The sun, sky, fog, stars and ambience follow the clock (crickets at night).
- **Navigation:** a waypoint graph of 272 nodes (roads, square, market aisle and every door, stall, bench and work spot). Every edge is verified with a Rapier capsule shape-cast, so paths don't cut through buildings, and routes use A*.
  - **Nearby villagers** (≤ 42 m) move with Rapier's character controller: they collide with walls, the player, each other and props, and push barrels and fruit.
  - **Distant villagers** follow their paths cheaply.
  - **Getting unstuck:** villagers sidestep first, then re-place themselves out of view if still stuck.
- **Reactions:**
  - They greet Jesus and turn their heads to follow him; the kids run over cheering "YESHUA!".
  - Passers-by stop to chat in pairs.
  - Bumping into someone gets a "Watch it!" as they step aside; **sprinting into someone knocks them flat** (+Chaos).
  - Breaking pottery startles bystanders and makes the potter furious.
- **Conversations:** press **E** near anyone. A dialogue panel offers 1–3 numbered answers, and the camera eases to an over-the-shoulder two-shot.
  - **What changes the lines:** time of day, your Chaos (people start to talk), and your progress. Villagers point you to the nearest undiscovered landmark with a compass direction.
  - **Kindness:** kind answers give a small one-time Faith reward.
  - **Speech bubbles:** world-space bubbles show barks, with a name tag on whoever you can talk to.
- **A small errand — "The Lost Sheep":** Amos asks you to find his runaway. She's on the Watchtower ridge; walk close and she follows you back to the flock (Faith +5).
- **Animals:** a flock of 6 sheep plus the stray, and 9 chickens that scatter, clucking, when you run past.
- **Market props:**
  - **Pottery:** clay pots shatter into pooled shards on hard impacts (+Chaos, merchant reacts).
  - **Fruit:** piles roll everywhere when you walk into them.
  - **Restocking:** disturbed props are quietly restocked after a while once you're far away, and still bodies are put to sleep.
- **Faith and Chaos:** both now move. Statistics show people met, pots broken and people knocked over.
- **Saving:** dialogue flags, people met and the time of day are saved and validated on load.
- **Audio:** villagers "speak" in pitched gibberish voices, and there are pot crashes, clucks, baas and night crickets — still all procedural.

## What Phase 1 contains

- **Main menu:** PLAY (or *PLAY — CONTINUE* with a save), a visibly disabled *MULTIPLAYER — COMING SOON* button with no network code behind it, SETTINGS and HOW TO PLAY. A slow orbit of the village plays behind it.
- **Jesus:** a procedural blocky character with long brown hair, a beard, a cream tunic, a red sash, leather sandals, a friendly face and a soft halo. A procedural rig drives idle breathing, walk, run lean, jump/fall poses, landing squash, and hair and sash sway.
- **Character controller:** Rapier kinematic character controller with a capsule. It has acceleration and deceleration, sprint, variable-height jump with coyote time and input buffering, autostep, slopes up to 48°, snap-to-ground, wall sliding, a soft valley boundary and fall recovery. It runs at a fixed 60 Hz with interpolated rendering.
- **Third-person camera:** mouse yaw/pitch, wheel zoom, and a shoulder aim view on right mouse. On obstruction it snaps in fast and eases back out; it ray-casts only against architecture and terrain, so thin trunks and props don't yank it. It never goes below the terrain, and its FOV widens while sprinting.
- **Nazareth:** a 500 × 500 m world (terrain, Sea of Galilee basin, perimeter hills) with the Nazareth valley open.
  - **Village:** about 55 limestone houses with painted shutters, roof beams, awnings, laundry lines, rooftop pergolas, and outdoor stairs up to walkable rooftops.
  - **Central sites:** the town square and well, a ten-stall market (fruit, bread, fish, pottery, fabric, spices), Joseph & Son Carpentry, and the synagogue.
  - **Outskirts:** the Rooftop Lookout, an olive grove with a stone press, and the old watchtower on the ridge.
  - **Living details:** about 40 dynamic barrels, crates and pots you can bump around. Countryside scatter is instanced (olives, cypress, bushes, rocks, grass); drifting stylised clouds, a gradient sky with sun glow and an animated lake complete the scene.
- **Playable loop — "Chapter I: Discover Nazareth":** find 7 landmarks, guided by minimap pins and an objective card with distance. Each one triggers a discovery banner and chime and autosaves; finding all seven completes the chapter.
- **HUD:** objective card with progress pips, Roman Attention stars, a rotating minimap, region label, follower count, a 6-slot miracle hotbar (locked, with tooltips), interaction prompts and dialog, toasts, and an optional FPS counter.
- **Pause menu:** Resume · Map · Missions · Miracles · Statistics (Faith, Chaos, distance, jumps, props knocked over, time played) · Settings · Save & Quit. **TAB** opens the full valley map.
- **Audio:** all procedural Web Audio, with no audio files. Footsteps differ on sand and stone; there are jump and land sounds, a wind bed, market chatter that rises near the stalls, birdsong, a soft lyre-and-drone music loop, a discovery arpeggio, and UI sounds. Music and SFX volumes are separate.
- **Save:** LocalStorage stores position, discovered landmarks, Faith/Chaos, stats, unlocked miracles, missions and settings. Saves are validated on load; a corrupted save is quarantined and the player starts fresh with a notice.
- **Browser and CrazyGames readiness:**
  - Responsive canvas and resize handling.
  - Pauses on pointer-lock loss and tab hide.
  - Loading screen with progress, plus a friendly error screen.
  - Low/Medium/High quality presets with automatic downgrade when FPS stays under 38.
  - No external network requests unless hosted on CrazyGames (then only the official SDK script); relative-base production build.

## Project structure

```
src/
  main.js                 boot + error screen
  core/                   EventBus, Input (intents), Loop (fixed 60 Hz + interpolation), Renderer, rng
  game/                   GameSession (systems + update order + test hooks), PlayerState, WorldState, miracles
  player/                 PlayerController (Rapier KCC), JesusModel (procedural rig), ThirdPersonCamera
  physics/PhysicsWorld.js Rapier world, static/dynamic bodies, ray casts
  world/                  layout (authoritative positions), terrain, Nazareth builder, vegetation, Sky, World, materials, textures, geometry batcher
  ui/                     UI (menus, HUD, pause, sheets, conversation, speech bubbles), Minimap + world map, icons
  npc/                    CharacterKit (NPC + legionary models, animator, ragdoll part boxes), NavGraph (A*), NPCManager (routines, reactions, LOD, villager ragdolls), roster, dialogue, Animals
  roman/                  RomanManager (garrison AI, perception, pursuit, arrests), RomanAttention (wanted level), legion (roster, routes, sight/speed tuning)
  physics/Ragdoll.js      Rapier ragdolls for CharacterKit rigs
  miracles/               MiracleManager
  vfx/                    Effects (pooled particles + rings)
  world/RomanCheckpoint.js the north-road camp
  world/Regions.js        Phase 5 sites: farm, goat hill, hamlet, isle, fort, circus, oasis, caravan camp, desert rocks
  vehicles/               VehicleManager (riding physics, mount/dismount, collisions, circus laps), mounts (procedural donkey/horse/camel/cart/chariot models)
  npc/Wildlife.js         instanced birds (shader flapping) and leaping fish
  missions/               MissionManager (state machine, markers, dialogue offers) + missions.js (Chapter III data, posted folk)
  game/reputation.js      Faith titles, Chaos tiers, Blessing costs and effects
  platform/Platform.js    host platform layer (CrazyGames SDK v3 adapter, local no-op platform)
  audio/AudioManager.js   procedural Web Audio
  save/SaveManager.js     LocalStorage + validation
tests/                    playtest.mjs + phase2/3/4/5/6 checks, platform.mjs, motion.mjs, npc-motion.mjs, roman-motion.mjs, ride-motion.mjs (Playwright, real input)
scripts/                  inspect-threejs-canvas.mjs (canvas/pixel/budget inspector)
artifacts/                evidence manifest, captures, playtest results, final-evidence.md
```

### Multiplayer-ready architecture (no networking yet)

- **State is separate from simulation:** `PlayerState` and `WorldState` hold pure data; controllers write it and the UI and save read it.
- **Stable IDs:** the player, landmarks, props and interactables all have them (e.g. `player.local`, `landmark.town-well`, `prop.barrel.03`).
- **Event bus:** gameplay publishes namespaced events such as `player:move`, `player:jump`, `landmark:discover`, `object:interact`, `prop:disturbed`, `mission:complete` and `session:*`. A future network layer can subscribe to the same stream.
- **Intent-driven input:** systems read intents, never DOM events, so input could come from a network or a replay.
- **Session-owned systems:** `GameSession` owns the systems and their update order, so it can later host more than one `PlayerState`.

## Known limitations

- **Missions are single-path:** six hand-written missions with fixed steps; there are no branching outcomes, failure states or timed missions yet. Followers don't fight, carry things or ride their own animals; they keep formation and rejoin out of sight.
- **Arcade riding:** rides are a kinematic box moved by Rapier's character controller, not wheel or leg physics. They can't swim, there are no boats to sail, and the cart carries nobody but you. Romans have no cavalry; they chase on foot. The circus has no rival racers.
- **Region people stand at posts:** the farmer, caravan folk and the centurion's servant stay at their spots (no daily routines outside Nazareth).
- **Ragdolls only for big hits:** legionaries always ragdoll under Divine Push and villagers do on close, strong hits (up to 8 ragdolls at once). Being bumped or sprinted into still plays the animated stumble. Ragdoll limbs don't collide with each other.
- **Simple stealth:** there is no crouching or hiding spot; you lose the Romans by breaking line of sight and waiting. The wanted level is not saved, so reloading clears it.
- **Night is brief:** about 84 seconds. Villagers vanish indoors rather than performing evening activities inside houses.
- **Edge of the map:** a square boundary at ±204 m; the ridges beyond are scenery.
- **Large Rapier bundle:** about 1.7 MB gzipped, because the `-compat` build inlines its WASM. Switching to the non-compat package with a separate `.wasm` file would cut this.
- **Performance unmeasured on a real GPU:** all automated captures ran on a software renderer, so FPS numbers from them aren't meaningful. Desktop render budgets pass; the mobile triangle budget is exceeded (≈340k vs 300k), and mobile is not a target for this release.
- **Camera passes through foliage:** the camera ignores tree trunks for collision, so it can pass through canopies.
- **CrazyGames SDK unverified against live docs:** see *Publishing on CrazyGames* above. No mobile/touch controls.

## Roadmap

1. ~~Phase 1 — Playable foundation~~ ✅
2. ~~Phase 2 — Living world~~ ✅
3. ~~Phase 3 — Miracles~~ ✅
4. ~~Phase 4 — Roman system~~ ✅
5. ~~Phase 5 — World expansion~~ ✅ countryside, lake, outpost, desert, rides (donkey, horse, camel, cart, chariot), animals.
6. ~~Phase 6 — Missions, Faith/Chaos, followers, full save~~ ✅
7. ~~Phase 7 — Polish, audio, optimisation, CrazyGames SDK integration~~ ✅ (submission to CrazyGames not done).

All models, textures and sounds are original and generated procedurally at runtime. No third-party or Roblox assets are used.
