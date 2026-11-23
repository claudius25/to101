# Slide & Match

Open the Angular route `/slide-and-match`. It loads this game in a sandboxed iframe with its own document, styles, and input handlers. Development uses the Angular app's usual `npm start`. A static deployment should fall back to Angular's `index.html` for this route, just as it does for `/game`. Change the URL and browser tab title in `src/app/app.routes.ts`. The iframe's own assets are served from `mini-games/triples/`.

| File | Settings |
| --- | --- |
| `settings.js` → `rules` | Board size, move budget, minimum starting empty spaces, distance-based scoring, the black tile's gray-tile rule, shuffle sampling, color spacing, drag threshold, and animation cleanup timeout. |
| `settings.js` → `copy` | Title, instructions, interface labels, accessibility labels, and status messages. Keep any named placeholders such as `{limit}` and `{groups}` where you want their values inserted. |
| `settings.js` → `families` | Organ, condition, care label, reference link and note, family swatch, PNG filename in `src/assets/triples`, and left/bottom lettering. Skin uses `art.imageRegion` to select its portion of the shared sheet. Use unique IDs and six-digit hex colors. Use `\n` to break a label across lines. |
| `settings.js` → `art` | Black and gray tile colors and glyphs, SVG view box, and organ lettering size and position. |
| `theme.css` | Font import and families, font sizes, weights, gaps, margins, board width, colors, corners, active scale, and animation timings. |
| `game.js`, `game.css`, `index.html` | Game rules, presentation selectors, and page structure. |

The default 6×6 board selects 11 of the 20 families. Each family uses exactly three cells. After reserving a black tile and the configured minimum empty spaces, the game fits as many complete families as possible. Any remaining spaces stay empty. A slide that would exceed the move budget is blocked. Completing the final triple on the last move wins.
