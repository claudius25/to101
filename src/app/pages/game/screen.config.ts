/**
 * The two 2D canvases that float on top of the 3D device: the narrow e-ink strip at the
 * top and the big black glass screen below it.
 *
 * While the device sits at its home framing the canvases are plain DOM `<canvas>`
 * elements, projected onto the screen faces as axis-aligned rectangles — that keeps the
 * text crisp and lets real 2D drawing (and later, DOM-friendly UI) run on top of WebGL.
 * As soon as the device is rotated away from that pose the rectangle no longer lines up
 * with the face, so the canvases are hidden and their last frame is shown as a
 * `CanvasTexture` on a plane glued to the screen mesh instead.
 *
 * Both nodes are found by name inside the GLB:
 *   eink  -> "E-ink • paper display • two-thirds width"   (~35 × 12 mm)
 *   glass -> "Screen • black glass • 96 × 40 × 1 mm"      (~51 × 39 mm)
 */

export type ScreenTheme = 'paper' | 'glass';

export interface ScreenDefinition {
  /** Stable id used to bind a DOM canvas and to swap in a custom painter. */
  id: string;
  /** Substring of the screen node name in the GLB. */
  node: string;
  /** Shown on the placeholder artwork and in the dev panel. */
  label: string;
  /** Picks the built-in dev artwork: matte paper or backlit glass. */
  theme: ScreenTheme;
}

export interface ScreenConfig {
  /** Canvas resolution, in pixels per metre of real screen surface. */
  pixelsPerMetre: number;
  /** Hard cap on either canvas dimension, in pixels. */
  maxTextureSize: number;
  /** How far the snapshot plane floats above the screen face, in metres. */
  liftMetres: number;
  /** Shrinks the overlay towards the centre of the face, as a fraction of its size. */
  inset: number;
  /**
   * How far the pose may drift from `DEVICE_VIEW_CONFIG`, in degrees, before the live
   * canvases are swapped for the frozen texture. Covers both the camera orbit and the
   * device's own rotation.
   */
  homeToleranceDeg: number;
  /** Live canvases are repainted at most this often. 0 repaints every frame. */
  repaintIntervalMs: number;
  screens: ScreenDefinition[];
}

export const SCREEN_CONFIG: ScreenConfig = {
  pixelsPerMetre: 10000,
  maxTextureSize: 1024,
  liftMetres: 0.00015,
  inset: 0,
  homeToleranceDeg: 0.5,
  repaintIntervalMs: 80,
  screens: [
    {
      id: 'eink',
      node: 'E-ink paper display',
      label: 'E-INK',
      theme: 'paper',
    },
    {
      id: 'glass',
      node: 'Screen black glass',
      label: 'MAIN',
      theme: 'glass',
    },
  ],
};
