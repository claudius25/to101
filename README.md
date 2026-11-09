# To101

A portrait-only mobile game built with [Angular CLI](https://github.com/angular/angular-cli) version 20.3.10.

## Portrait-only behaviour

The game is designed for a single orientation. This is enforced with CSS only — there is no
orientation JavaScript to keep in sync.

| Context | Behaviour |
| --- | --- |
| Phone/tablet in portrait | Game fills the screen, inset by the device safe areas |
| Phone/tablet in landscape | Game is hidden and a "Rotate your device" overlay takes over |
| Short landscape window (`max-height: 520px`) | Same rotate overlay |
| Desktop / wide window | Game is letterboxed into a centred 9:16 portrait frame |

Key files:

- [`src/index.html`](./src/index.html) — `viewport-fit=cover`, zoom disabled, web-app meta tags
- [`src/styles.scss`](./src/styles.scss) — fixed body, no page scroll or overscroll chaining,
  safe-area CSS variables (`--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left`) and the
  shared colour palette
- [`src/app/app.html`](./src/app/app.html) / [`src/app/app.scss`](./src/app/app.scss) — the portrait
  shell and the rotate overlay, including the landscape media queries

Game screens live under `src/app/pages/` and are lazy-loaded from
[`src/app/app.routes.ts`](./src/app/app.routes.ts).

## Screens

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | [`pages/home`](./src/app/pages/home) | Launcher art (`assets/launcher.png`); tapping it opens the game |
| `/game` | [`pages/game`](./src/app/pages/game) | three.js view of `assets/aluminium-device-game.glb` |

The dev panel is hidden by default. **Tap the top-left corner of the screen three times** in
quick succession to toggle it.

Binary assets live in `src/assets/` and are served from `/assets/` via the asset mapping in
[`angular.json`](./angular.json).

## 3D device view

[`pages/game`](./src/app/pages/game/game.ts) renders the device with three.js (`three@0.187`):

- A `PMREMGenerator` + `RoomEnvironment` image-based light, so the brushed aluminium has
  something to reflect, plus a key and fill `DirectionalLight`.
- **Tightest possible framing.** Every frame the eight corners of the model's bounding box are
  projected onto the camera basis and the smallest distance (perspective) or frustum size
  (orthographic) that still contains all of them is used. The framing therefore stays exact as
  the camera orbits, the device spins, or the stage is resized.
- The model is centred at the origin and parented to a pivot `Group`, so both the camera target
  and the device's own rotation share the same centre.
- The render loop runs via `NgZone.runOutsideAngular`, and the drawing buffer is reconciled with
  the canvas CSS box each frame (the stage can be hidden by the landscape lock at any time).

### Dev panel

A collapsible panel is docked to the right edge of the game screen — tap the **DEV** handle.

| Control | Effect |
| --- | --- |
| Projection | Switches between perspective and orthographic cameras |
| Field of view | Perspective only (10°–90°) |
| Azimuth / Elevation / Roll | Orbits the camera around the device, always targeting its centre |
| Fit margin | `1.00×` is the tightest fit; raise it to add breathing room |
| Auto-rotate azimuth | Continuously spins the camera around the device |
| Pitch · X / Yaw · Y / Roll · Z | Rotates the device itself about its own centre |
| Reset view | Restores every control to its default |

The panel also reports the model's bounding-box size and the live canvas resolution.

## Rolling the dice

Press and hold the orange **ROLL THE DICE** fin on the device. The lever swings towards you,
both drums spin up, and when you let go they slow to a stop on the rolled number.

- [`dice.service.ts`](./src/app/services/dice.service.ts) picks the result. With the default
  `uniform-total` distribution every total from 1 to 12 is equally likely; it then chooses a
  facet pair that adds up to it. `uniform-faces` instead rolls the two drums independently,
  which gives the usual triangular distribution.
- [`dice-machine.ts`](./src/app/pages/game/dice-machine.ts) animates the rig. It finds the
  lever and drums by name, tweens the lever, ramps each drum up to speed, and on release picks
  the nearest resting angle that is still at least `settleMinTurns` further along, so a drum
  never snaps backwards into place.
- [`game.ts`](./src/app/pages/game/game.ts) raycasts pointer events against the lever and feeds
  the machine frame deltas.

### Wheel geometry

Both drums spin about their local Y axis. The readable facet is the one pointing up, which is
local `phi = -90°`. Measured from the GLB:

| Drum | Node | Facets | Spacing | Values |
| --- | --- | --- | --- | --- |
| One | `Button • middle 2 • …` | 7 (one blank) | 51.43° | 0–6 |
| Two | `Button • middle 3 • 21.25 mm` | 6 | 60° | 1–6 |

Hence totals of 1–12. The `offsetDeg` values in the config are derived from those measurements,
so the correct face is already upright — change them only if the model is re-exported.

### Tuning

[`dice.config.ts`](./src/app/pages/game/dice.config.ts) holds every knob: lever axis, pull angle
and offset, press/release durations and easings, per-drum spin speed, spin-up time, stop stagger,
stop duration, minimum turns, easing, spin and face direction, facet count, rest value, the roll
range and distribution, plus the minimum spin time, an auto-release timeout, and a
`pressAnywhere` flag that lets you grab the lever by tapping anywhere on the device.

Available easings: `linear`, `easeOutQuad`, `easeOutCubic`, `easeOutQuint`, `easeInOutCubic`,
`easeOutBack`, `easeOutElastic`.

The dev panel's **Dice** section shows the last result as `total (wheelOne + wheelTwo)` and warns
if any rig node could not be found in the model.

## Keypad

The six grey keys (a 3×2 grid) and the double-height orange Enter key depress when pressed and
spring back on release. [`keypad.ts`](./src/app/pages/game/keypad.ts) moves each cap along its own
down axis, so the keypad's slight tilt is respected, and restores the exact rest position.

[`keypad.config.ts`](./src/app/pages/game/keypad.config.ts) holds the knobs: travel axis and
distance, press/release durations and easings, an auto-release timeout, and the key list with
per-key travel overrides. The caps are only 1 mm tall, so `travelMetres` (default `0.0004`) must
stay well under a millimetre.

Key ids reported by `Keypad.onPress`, in reading order: `close`, `left`, `up`, `down`, `settings`,
`right`, `enter`. The dev panel's **Keypad** section shows the last one pressed.

## Node lookups

Both rigs resolve model nodes through `findNode` in
[`rig-utils.ts`](./src/app/pages/game/rig-utils.ts), which also hosts the shared easings, axis
vectors and `Tween`.

Matching is deliberately forgiving, because three's `GLTFLoader` rewrites names via
`PropertyBinding.sanitizeNodeName` (spaces become underscores, `[ ] . : /` are stripped) and the
model decorates names with bullets:

```
"Key • column 2 • upper grey"  ->  "Key_•_column_2_•_upper_grey"
```

So a config fragment is matched as **whole words in order**: `column 2 upper` matches the node
above, while `middle 2` will not match `Button_•_middle_3_•_2125_mm` even though `2125` contains
a `2`. If a node can't be found, the game screen shows `Missing nodes: …`.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

Use the browser devtools device toolbar (or a real phone on your LAN via `ng serve --host 0.0.0.0`)
to test both orientations.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
