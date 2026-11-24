# God's Intern v0.5: manual human playtest checklist

The automated tests show that each path below works. They cannot show that a new
player *finds* it, *understands* it, or *enjoys* it. Run this with real people
before publishing.

## Setup

- Recruit at least 3 people who have never played. If possible, include one who rarely
  plays games, one regular PC player and one phone player.
- Give them no instructions beyond: "This is a game about being God's intern. Play
  however you like; think out loud."
- Observe silently. Do not help unless they are stuck for more than 60 seconds; if you
  do help, write down where.
- Use a fresh browser profile (or **Settings → clear site data**) so they start at the
  main menu with no save.
- Record each session's device, browser and screen size, and whether sound was on.

## First 10 minutes (time each item)

| # | Observe | Time | Found unaided? | Notes |
| --- | --- | --- | --- | --- |
| 1 | Understands the main menu and chooses NEW CAREER (or explains why Creative) | | | |
| 2 | Reads the intro lines without skipping past confusion | | | |
| 3 | Finds and selects **Rain** after the prompt | | | |
| 4 | Casts rain near the well / farms | | | |
| 5 | Notices the villagers' reaction | | | |
| 6 | Selects a second power on their own | | | |
| 7 | Cancels a selected power (button or Esc) | | | |
| 8 | Inspects a villager (clicks one with no power selected) | | | |
| 9 | Opens WORLD and understands what a village needs | | | |
| 10 | Uses a prayer card (Focus or the suggested power) | | | |
| 11 | Notices their current goal (bottom-left) | | | |
| 12 | Completes a challenge | | | |
| 13 | Opens CAREER and can say what unlocks next | | | |
| 14 | Unlocks Mutation (target 5–10 min) and tries it | | | |

## Usability questions after the session

1. "What were you trying to do in the first minute?"
2. "How do you use a power? How do you stop using one?"
3. "What does Energy do? What about Approval and Chaos?"
4. "What will you unlock next, and how?"
5. "Was anything on screen in your way?"
6. "Was there a moment you didn't know what to do?"
7. "Did unlocks feel too fast, too slow, or about right?"
8. Phone players: "Did any tap do something you didn't mean?"

## Pacing (longer sessions, optional)

- Note the real time to Tornado (target 8–12 min), Freeze (15–20 min) and Gravity
  (25–35 min).
- Note any stretch of more than 3 minutes where the player says they have "nothing to do".
- Note whether a destructive play style felt faster than helping (it should not).

## Devices still to cover with real hardware

The automated runs used Chromium with SwiftShader and Chromium mobile emulation only.
These still need a person and a real device:

- [ ] iPhone (Safari), landscape: audio starts after the first tap; no page zoom or scroll
- [ ] Android phone (Chrome), landscape
- [ ] iPad or Android tablet, landscape
- [ ] Desktop Safari and Firefox
- [ ] A low-end laptop with integrated graphics (Auto quality should settle on Low or Medium)
- [ ] A 4 GB RAM Chromebook (a CrazyGames compatibility target)
- [ ] The portrait-phone rotate prompt, and the safe areas on a notched phone
- [ ] Possession on touch: the walk pad, Interact and Leave
- [ ] Two-finger pinch and twist never cast a power by accident

## Accessibility pass

- [ ] Play 5 minutes with sound off; nothing important is audio-only
- [ ] Keyboard only: menus and panels reachable with Tab, with a focus ring visible
- [ ] Reduced motion on: no flashing, no bouncing; still playable
- [ ] Camera shake off
- [ ] Text readable at 100% browser zoom on a 1366×768 laptop
- [ ] Every power state (locked, need energy, recharging, selected) is clear without color
