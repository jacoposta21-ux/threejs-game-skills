# SHELL SWITCH — Design

## Design brief

- **Player promise:** You are Glim, a pocket-sized alien who hops inside the townsfolk of Fizzwick and borrows their bodies, their talents, and their reputations to rebuild your crashed saucer.
- **Target feeling:** Mischievous curiosity. "What happens if I'm the clown *here*?"
- **Primary verb:** Possess (E) → use the host's ability (F) → exit (Q).
- **Secondary verbs:** run, jump, carry, pick locks, pickpocket, cook and serve, sing-lure, intimidate, perform, phase, zap, cannon-launch.
- **Every 5–30 s:** find a host, try their ability on the world or a crowd, read the reaction.
- **Across 1–5 min:** chain two or three hosts into one mission, unlock a door or an area, collect a Star Core.
- **Lose / learn / restart:** NPCs who witness strange behaviour grow suspicious (? → !). Civilians panic; guards chase. A guard who catches you ejects Glim and tosses it back to the area's safe spot. Mission state is never lost; only position.
- **Reward / risk:** Star Bits, postcards (secrets), new hosts, new areas, Star Cores. Risk is being seen as the naked alien or doing shady things in a guard's view cone.
- **A better player:** possesses out of sight, parks hosts where they'll be useful later, finds alternative solutions (several guards have more than one weakness), finds the vent and smash-wall secrets.
- **Next decision communicated by:** mission tracker hint text, world prompts above targets, NPC barks reacting to the current host, the ability indicator showing what F will do *right now*.
- **Non-goals:** combat, timers, fail screens, procedural levels, multiplayer, backend.

## Core loop contract

Player **possesses a host** to **use its ability on a blocked objective** while **NPC suspicion and guard view cones** create risk; success **opens doors/areas and grants Star Cores / new hosts**, failure **ejects Glim back to a safe spot with all mission progress kept**.

Proof in code: possession is bound to E/touch, objectives are listed in the tracker and marked in-world, suspicion meters start in the first area, rewards flip world flags (doors open, gates lift, NPCs relocate), getting caught teleports with a short pratfall and ~2 s to retry.

## Hosts (all possessable)

| Host | Area | Movement | F ability | Real use |
| --- | --- | --- | --- | --- |
| Glim (alien) | — | tiny, fastest, high jump | Hop-dash | climbs crate steps, fits through vents |
| Brick (strongman) | Station | slow, heavy stomp | Lift / throw heavy things, smash cracked walls | crates onto plates and as steps, aim the cannon, secrets |
| Officer Pina (police) | Station | brisk march | Whistle & order | moves loiterers and some guards |
| Noodle (clown) | Circus | bouncy, higher jump | Showtime | crowd gathers, guards distracted (lingers after you leave) |
| Chef Bun (chef) | Mall | waddle | Cook at stove / serve | feed hungry guards to clear posts |
| Slink (thief) | Circus | sneaky crouch, low suspicion | Pick lock / pickpocket | locked doors, keycards, junk pockets |
| Velvet Vox (singer) | Mall | glide | Serenade | lure crowds and fans, fill audiences |
| Lady Mopewell (ghost) | Museum | float, no fall | Phase + Boo | pass bars and glass, scare crowds |
| Prof. Volta (scientist) | Museum | hurried | Zap | power generators, panels, machines |
| Mayor Bumbleton (bonus) | City Hall | pompous strut | Proclamation | decree-doors and city holiday |

## Level plan

Spatial format: one continuous open town, third-person orbit camera (~6 m behind, pitch 15–60°). Fountain Square hub links all five areas through gated streets.

```
                 [City Hall]  z≈-52
                      |
 [Museum] --- west branch
                      |
 [Mall] ------ [Fountain Square] ------ [Circus]
                      |
               [Train Station]  z≈46 (start)
```

- **Start:** Glim's saucer crashed onto Platform 1. First decision within 10 s: a heavy crate blocks the platform stairs and Brick the porter is standing beside it.
- **Gating:** Station mission 2 (City Pass) opens the turnstiles → Mall + Circus. 3 Star Cores opens the Museum gate, 4 opens City Hall. All 5 → return to the saucer for the finale. Cross-area host travel is required (strongman aims the circus cannon, thief picks museum and mall locks).
- **Escalation:** Station teaches one host per mission, then combines. Mall/Circus introduce distractions and stealth. Museum combines three hosts. City Hall combines machines, food and the bonus host.
- **Recovery beats:** hub fountain, benches, star-bit trails along streets.
- **Telegraphs:** guards show view-cone suspicion icons; lasers glow and hum; locked doors show padlock decals; ghost bars glow blue; heavy crates have a strap decal; machines have a lightning plate.

### Missions (16)

| # | Area | Mission | Hosts | Reward |
| --- | --- | --- | --- | --- |
| S1 | Station | Heavy Baggage — clear the platform stairs | Brick | stairs open |
| S2 | Station | City Pass — move Spike from the ticket window | Pina (or later ghost / singer) | turnstiles → Mall + Circus |
| S3 | Station | Newsstand Core — reach the core on the newsstand roof | Pina moves guard Gertie, Brick places crate step, Glim jumps | Star Core 1 |
| M1 | Mall | Lunch Break — feed guard Waldo | Chef | staff room → Velvet's lucky mic |
| M2 | Mall | Open Mic — fill the stage audience | Velvet (+mic) | Star Bits, fans |
| M3 | Mall | Sparkle & Co. — lift the "Mystery Gem" | distraction (singer/clown) + Slink | Star Core 2 |
| C1 | Circus | Tough Crowd — entertain the queue | Noodle | Big Top opens |
| C2 | Circus | Backstage Pass — get the bouncer's keycard | Noodle distracts + Slink pickpockets | trailer → Cannon Fuse |
| C3 | Circus | Shot From a Cannon — reach the trapeze | fuse + Brick aims + anyone launches | Star Core 3 |
| U1 | Museum | Lights Out — restore power | Volta | east wing doors |
| U2 | Museum | Haunted Archive — throw the archive lever | Mopewell | vault corridor |
| U3 | Museum | Meteorite Heist — lasers, lock, case | Slink + Volta + Mopewell | Star Core 4 |
| H1 | City Hall | Red Tape — fix the stamp machine, get a permit | Volta | upstairs |
| H2 | City Hall | Bodyguard's Appetite — soufflé for Tank | Chef | Mayor's office |
| H3 | City Hall | Key to the City — decree the vault open | Mayor | Star Core 5 |
| F | Station | Homeward Bound — return all cores to the saucer | any | ending |

Each area also has 10 Star Bits, 2 hidden postcards (secrets reached by vents, smash walls, bouncy-jump ledges, ghost phasing, or pickpocketing), and environmental storytelling props (crash scorch trail, UFO headlines, lost-and-found pile, etc.).

## Guidance and post-game (v2)

- Every mission step declares which hosts can do it, three escalating hints (auto after ~60 s / 130 s / 210 s on a step, or on demand with H) and, where useful, a live counter (spectators, listeners).
- If you wear the wrong host, the tracker says who is needed and where they are, and the marker points to them first.
- Objects and guards explain themselves when you can't use them ("only Slink can pick it", "Waldo is starving…").
- One-time tutorial tips: movement, possession, F ability, carrying, hopping out, suspicion, hints, journal.
- After the finale every NPC can be possessed as an "extra" with a generated name, bio and a harmless ability (flash, lure, show, nap, halt, spray, freeze, bark). Long walks between districts are kept on purpose.

## Physics

Custom collision (documented choice): static AABB world colliders on a spatial grid, cylinder character controller with step-up, gravity, jump; heavy crates are kinematic AABBs. No rigid-body simulation is needed — authored feel and deterministic puzzles matter more.
