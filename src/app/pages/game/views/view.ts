import { ScreenInfo } from '../screens';

/**
 * A *view* is one full-screen 2D drawing on the glass screen: a chapter, a menu, a
 * dialog. The glass surface itself (where it sits on the device, how it is projected,
 * when it freezes into a texture) is handled by `screens.ts` — views only ever see a
 * plain 2D context and a few pixels of layout.
 *
 * Views are stacked: `go` replaces the stack (chapter to chapter), `push` lays one on
 * top (settings over a chapter) and `back` pops it off. Every view in the stack is
 * painted bottom-up, so a modal can draw a scrim over whatever it covers, but only the
 * top one receives taps and keys.
 *
 * Adding a screen: add its id to `ViewId`, write the class, register it in
 * `views/router.ts`.
 */
export type ViewId = 'chapter-1' | 'chapter-2' | 'settings';

export interface Hotspot {
  /** Id handed back to `ScreenView.press`. */
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tap targets, rebuilt by the top view on every paint. All values in canvas pixels. */
export class HitRegistry {
  private readonly spots: Hotspot[] = [];

  reset(): void {
    this.spots.length = 0;
  }

  add(target: string, x: number, y: number, width: number, height: number): void {
    this.spots.push({ target, x, y, width, height });
  }

  /** Last match wins, because whatever was drawn last sits on top. */
  find(x: number, y: number): string | null {
    for (let index = this.spots.length - 1; index >= 0; index--) {
      const spot = this.spots[index];
      if (x >= spot.x && x <= spot.x + spot.width && y >= spot.y && y <= spot.y + spot.height) {
        return spot.target;
      }
    }
    return null;
  }
}

export interface ViewFrame {
  ctx: CanvasRenderingContext2D;
  /** Canvas resolution, in pixels. */
  width: number;
  height: number;
  /** `height / 100`. Lay views out in these units and they scale with the texture. */
  unit: number;
  elapsedMs: number;
  /** True on the last paint before the canvas is frozen into a texture. */
  frozen: boolean;
  /** Live game data: last key, last dice roll, and so on. */
  info: ScreenInfo;
  /** Target held down right now, so buttons can draw a pressed state. */
  pressed: string | null;
  hit: HitRegistry;
}

/** What a view is allowed to do to the stack. */
export interface ViewNav {
  readonly current: ViewId;
  readonly depth: number;
  /** Replace the whole stack — use it to move between chapters. */
  go(id: ViewId): void;
  /** Lay a view on top of the current one — use it for menus and dialogs. */
  push(id: ViewId): void;
  back(): void;
}

export interface ScreenView {
  readonly id: ViewId;
  /** Called every time the view is put on the stack. */
  enter?(nav: ViewNav): void;
  exit?(): void;
  paint(frame: ViewFrame): void;
  /** A hotspot registered during paint was tapped. */
  press?(target: string, nav: ViewNav): void;
  /** A device key was pressed. Return true to stop the router handling it. */
  key?(key: string, nav: ViewNav): boolean;
}
