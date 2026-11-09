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
