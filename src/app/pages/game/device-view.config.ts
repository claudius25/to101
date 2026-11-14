/**
 * Tuned camera and device-rotation parameters for the 3D device view.
 *
 * These are the values the game boots with. Tweak them live with the dev panel on the
 * game screen, then use its "Copy settings" button and paste the result back in here to
 * make the new framing permanent.
 */

export type CameraMode = 'perspective' | 'orthographic';

export interface CameraConfig {
  /** Perspective keeps foreshortening; orthographic renders a flat, technical view. */
  mode: CameraMode;
  /** Vertical field of view in degrees. Perspective only. */
  fov: number;
  /** Orbit around the device's vertical axis, in degrees. */
  azimuth: number;
  /** Orbit above (+) or below (-) the device, in degrees. Clamped to ±89. */
  elevation: number;
  /** Camera roll about its own view axis, in degrees. */
  roll: number;
  /** Framing slack. 1 is the tightest fit that still shows the whole device. */
  margin: number;
  /** Continuously spin the azimuth, for inspecting the model. */
  autoRotate: boolean;
}

/** Rotation of the device itself, in degrees, about its own centre. */
export interface DeviceRotationConfig {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface RenderConfig {
  /**
   * Internal resolution, as a share of the canvas's CSS size (on top of the device
   * pixel ratio, which is capped at 2). Below 1 the device is drawn into a smaller
   * buffer and scaled up, which is the cheapest way to buy back frame time: the studio
   * rig's rect-area lights cost per pixel, and they dominate the frame.
   *
   * The 2D screen overlays are separate DOM canvases drawn at full size, so the glass
   * and e-ink surfaces stay sharp whatever this is set to — only the metal softens.
   */
  scale: number;
}

export interface DeviceViewConfig {
  camera: CameraConfig;
  device: DeviceRotationConfig;
  render: RenderConfig;
}

export interface ControlRange {
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export const DEVICE_VIEW_CONFIG: DeviceViewConfig = {
  camera: {
    mode: 'perspective',
    fov: 13,
    azimuth: 0,
    elevation: 51,
    roll: 0,
    margin: 1,
    autoRotate: false,
  },
  device: {
    pitch: 0,
    yaw: 0,
    roll: 0,
  },
  render: {
    scale: 0.75,
  },
};

/** Bounds and precision for the dev-panel sliders. */
export const DEVICE_VIEW_RANGES = {
  fov: { min: 10, max: 90, step: 1, decimals: 0 },
  azimuth: { min: -180, max: 180, step: 1, decimals: 0 },
  elevation: { min: -89, max: 89, step: 1, decimals: 0 },
  roll: { min: -180, max: 180, step: 1, decimals: 0 },
  margin: { min: 1, max: 2, step: 0.01, decimals: 2 },
  deviceRotation: { min: -180, max: 180, step: 1, decimals: 0 },
  renderScale: { min: 0.4, max: 1, step: 0.05, decimals: 2 },
} satisfies Record<string, ControlRange>;
