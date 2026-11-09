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

export interface DeviceViewConfig {
  camera: CameraConfig;
  device: DeviceRotationConfig;
}

export interface ControlRange {
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export const DEVICE_VIEW_CONFIG: DeviceViewConfig = {
  camera: {
    mode: 'orthographic',
    fov: 35,
    azimuth: 0,
    elevation: 68,
    roll: 1,
    margin: 1,
    autoRotate: false,
  },
  device: {
    pitch: 0,
    yaw: 0,
    roll: 8,
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
} satisfies Record<string, ControlRange>;
