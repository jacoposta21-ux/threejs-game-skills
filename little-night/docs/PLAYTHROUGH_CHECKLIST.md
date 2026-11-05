# LITTLE NIGHT — Start-to-Finish Playthrough Checklist

Use this for manual QA on a real browser (desktop first, then a phone). The automated version of the same route lives in `tests/playthrough.spec.ts` (`npm run test:playthrough`).

## Boot & menu
- [ ] Page loads straight into the main menu with the live bedroom behind it; no console errors.
- [ ] New Game / Settings / Credits buttons work; Continue appears only when a save exists.
- [ ] Settings: master/music/sound sliders change volume live; sensitivity and invert-Y affect look; Low/Medium/High changes quality without a reload; subtitles toggle hides `[sound]` captions. Settings persist after refresh.

## Chapter I — The Bedroom
- [ ] Wake on the bed during a lightning flash; chapter card shows; the melody is audible from the hallway direction.
- [ ] Walk, look, hop (Space), crawl (C); crawl under the bed (standing is blocked under it).
- [ ] Bottom dresser drawer glows → Open → Pick up the firefly → LUMO wakes (cinematic, skippable with E).
- [ ] F toggles LUMO's light; the energy firefly (bottom-left) drains only while lit.
- [ ] With LUMO lit, glowing chalk fireflies/arrows appear on the floor and lead to the toy shelf.
- [ ] Climb toy box → shelf (Space); "Wind the Nest" charges LUMO to full; F calls it back.
- [ ] Door handle shows "The handle is too high" from the floor.
- [ ] Push / pull the toy chest (W/S, E to let go) to the door; climb it; Open the door. Checkpoint toast.
- [ ] Hallway: stepping into the dark makes shadow hands grab and drag you back (no death).
- [ ] Place LUMO on perch A (the floor lights up), walk in. THE HUSH climbs the stairs (warning creaks + subtitle first).
- [ ] Hide (under the bed, wardrobe, or linen closet). THE HUSH investigates, searches, and leaves down the stairs. Checkpoint.
- [ ] If it saw you or you stayed out: catch scare → back at the door checkpoint with progress kept.
- [ ] Place LUMO on perch B; crawl into the laundry chute → Chapter II.

## Chapter II — The Kitchen
- [ ] Land in the laundry basket; THE HUSH patrols around the island; walking makes it turn toward noise, crawling doesn't.
- [ ] Spoons by the island and the tray by the doorway clatter loudly if stepped on.
- [ ] Hide under the table, under the island overhang, inside the cabinet run (sink cabinet), or in the utility cupboard.
- [ ] Pantry door: "Locked. There's a little keyhole."
- [ ] Push a dining chair to the counter, climb chair → counter (forced crawl under cabinets), push the bread tin aside, take the key. Checkpoint.
- [ ] THE HUSH moves to guard the pantry. Pick up a spoon/block and throw it (E / click): it goes to investigate the landing spot.
- [ ] Unlock the pantry. Checkpoint. Pantry is deep dark: perch A from the doorway, walk in, perch B on the far wall.
- [ ] Pull the flour sack away (S) to reveal a crawl hole. Take Grandpa's wind key: radio stops, SHHH, chase begins.
- [ ] Crawl through the hole: a long arm reaches after you. Checkpoint. THE HUSH comes around through the gate.
- [ ] Climb the attic ladder → Chapter III.

## Chapter III — The Attic
- [ ] Arrive by the hatch; the Nest and Grandpa's note are nearby. The melody is loud and close.
- [ ] The toy graveyard is deep dark: perch A, open the toy trunk, take the spring; perch B; leave the dark.
- [ ] THE HUSH appears and patrols; the sheet-covered armchair, wardrobe and space under the workbench/toy table hide you.
- [ ] Workbench drawer → brass gear. Climb crate → crate → wardrobe → crank handle.
- [ ] Fit gear, spring and crank in the mechanism, turn the crank: the gate rises. Checkpoint.
- [ ] Push the old trunk under the magic lantern, climb it, put LUMO inside: three symbols appear on the far wall.
- [ ] Turn the three dials to match (left to right). The cage lifts. Checkpoint.
- [ ] Wind the music box with the wind key; THE HUSH approaches; give LUMO's light to the music box.
- [ ] Finale: LUMO blazes, hidden chalk drawings appear everywhere, THE HUSH kneels and becomes a coat, the lights come back, Mama calls. Ending screen + credits. Return to menu.

## Systems
- [ ] Refresh mid-chapter → Continue resumes at the last checkpoint with items, flags and moved objects restored.
- [ ] Esc / P pauses and releases the mouse; clicking Resume re-locks; alt-tab or hiding the tab pauses and mutes.
- [ ] LUMO at 0 energy goes dark and says so; Nests always refill it.
- [ ] No way to fall out of the world or get stuck: every ledge you can climb onto you can walk off.
- [ ] Mobile: joystick (left half), drag to look (right half), interact (contextual label), LUMO, crawl, climb, pause buttons; nothing covers the prompt or crosshair.
