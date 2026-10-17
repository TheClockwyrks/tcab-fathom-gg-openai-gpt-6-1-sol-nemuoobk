# Fathom — Kindle

**Hunt in the dark.** A browser-only, bioluminescent maze chase. Graze plankton,
read the corridors by your own cool light, and use sonar to remember what lies
around the next bend. Eating widens your circular window into the abyss—but it
also makes you easier to hunt.

The Lanternjaw follows light, the eyeless Gloamfin follows sound, and the
Flarefish searches with a bloom that burns through rock. Clear every mote to
advance into deeper water with more hunters and shorter sonar reach.

## Run

Requires a current Node.js release supported by Vite.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No backend, account, external font, or network
service is needed.

## Build and serve

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`, including `index.html` and all sprite
frames. Serve that directory at a static server's root or under a sub-path; URLs
are page-relative.

## Controls

| Control | Action |
| --- | --- |
| WASD / arrow keys | Hold to swim; release to stop. Turns buffer until a junction. |
| Space | Sonar pulse (1.5-second recharge) |
| Left / right Shift | Ink cloud (8-second recharge) |
| Escape / P | Pause / resume |
| Up / down | Select a menu item |
| Enter / Space | Confirm |
| Escape | Back |
| M | Mute / unmute |
| Backtick | Engine diagnostic overlay |

Menus also accept pointer and touch. Touch devices receive the engine's
four-way pad and action buttons. Sound is optional and unlocks on the first
gesture. Three reserve lives accompany the first attempt.

## Development

Built on Simple 2D: the engine owns the clock, canvas fitting, input, audio,
asset loading, diagnostics, and draw-command recording. The simulation advances
at 120 fixed ticks per second and returns a new state every frame.

- `src/game.ts`: engine registration and screen/input transitions
- `src/model.ts`: state, layout, and derived readings
- `src/simulation.ts`: movement, fog, sonar, predators, and progression
- `src/debug.ts`: validated poses and JSON snapshots, accessed via `engine.debug`
- `src/render.ts`: canvas presentation
- `src/game.test.ts`: counted-frame engine tests on a native canvas
- `showcase/`: player description, screenshots, and a three-second engine replay

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests exercise the real engine with scripted clocks, loaded sprite frames, and
keyboard/pointer events. Coverage reports are written to `coverage/`.
