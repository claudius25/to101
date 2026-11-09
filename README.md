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
