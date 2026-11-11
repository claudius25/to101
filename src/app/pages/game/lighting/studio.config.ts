/**
 * Studio lighting preset for the aluminium device.
 *
 * Every coordinate here is in *device space*: the origin sits at the centre of the
 * assembled GLB bounds, +Y points out of the front face, +X toward the side wheels and
 * +Z toward the keypad. The numbers were authored against a device `referenceLength`
 * long on Z; the rig measures the real model when it attaches and scales every
 * position, target and strip size by the ratio, so the GLB keeps its own size and
 * orientation and only the lights move to fit.
 *
 * The rig is parented to the same frame as the model, so it is rigid in device space:
 * rotate the device and the highlights stay on the keypad, the rollers and the watch.
 */

export type Vec3 = [number, number, number];

/** A RectAreaLight strip placed by hand. */
export interface StripLight {
  id: string;
  color: string;
  intensity: number;
  /** Size across the strip's own X and Y, before `rotateZ`. */
  width: number;
  height: number;
  position: Vec3;
  target: Vec3;
  /** Spin about the strip's own axis once it has been aimed, in radians. */
  rotateZ?: number;
}

/** A strip aimed at the centre of a named part's bounds. */
export interface PartStripLight {
  id: string;
  color: string;
  intensity: number;
  width: number;
  height: number;
  /** Prefix matched against `userData.name`, falling back to `name`. */
  part: string;
  /** Added to the part's bounds centre to place the light. */
  offset: Vec3;
  rotateZ?: number;
}

export interface DirectionalLightSpec {
  id: string;
  color: string;
  intensity: number;
  /** Aimed at the device centre. */
  position: Vec3;
  castShadow?: boolean;
}

/** Makes one named part glow without touching anything that shares its material. */
export interface EmissiveAccent {
  part: string;
  color: string;
  intensity: number;
}

export interface StudioPreset {
  /** Device length along Z that the coordinates below were authored against. */
  referenceLength: number;
  toneMappingExposure: number;
  environmentIntensity: number;
  /** Blur used if the rig has to generate a PMREM itself. */
  environmentBlur: number;
  /**
   * Intensity of an upward-facing bounce card under the device. 0 adds nothing, which
   * is what this preset wants: the device is lit in the air, with no floor under it.
   */
  floorBounce: number;
  /**
   * Recorded for completeness. This renderer has no ambient-occlusion pass, and the
   * preset is authored without one, so nothing switches on when it is false.
   */
  ambientOcclusion: boolean;
  shadows: {
    enabled: boolean;
    mapSize: number;
    /** Scaled by the model radius, so the bias follows the real device size. */
    normalBias: number;
  };
  strips: StripLight[];
  partStrips: PartStripLight[];
  accents: EmissiveAccent[];
  directionals: DirectionalLightSpec[];
}

const QUARTER_TURN = Math.PI / 2;

export const STUDIO_PRESET: StudioPreset = {
  referenceLength: 2.55,
  toneMappingExposure: 1,
  environmentIntensity: 0.11,
  environmentBlur: 0.04,
  floorBounce: 0,
  ambientOcclusion: false,
  shadows: { enabled: true, mapSize: 2048, normalBias: 0.02 },
  strips: [
    {
      id: 'keypad',
      color: '#fff1df',
      intensity: 10.9,
      width: 1.25,
      height: 0.09,
      position: [0, 0.55, 1.36],
      target: [0, 0.12, 0.89],
    },
    {
      id: 'front-rollers',
      color: '#fff5e8',
      intensity: 5.8,
      width: 1.2,
      height: 0.065,
      position: [-0.08, 0.55, 0.48],
      target: [0, 0.12, 0.28],
    },
    {
      id: 'side-wheels',
      color: '#e3efff',
      intensity: 4.64,
      width: 0.8,
      height: 0.08,
      position: [1.1, 0.43, -0.25],
      target: [0.65, 0, -0.24],
      rotateZ: QUARTER_TURN,
    },
    {
      id: 'side-wall-right',
      color: '#eef4ff',
      intensity: 5,
      width: 2.55,
      height: 0.42,
      position: [1.25, 0.16, 0],
      target: [0.64, -0.08, 0],
      rotateZ: QUARTER_TURN,
    },
    {
      id: 'side-wall-left',
      color: '#eef4ff',
      intensity: 5,
      width: 2.55,
      height: 0.42,
      position: [-1.25, 0.16, 0],
      target: [-0.64, -0.08, 0],
      rotateZ: QUARTER_TURN,
    },
  ],
  partStrips: [
    {
      id: 'roll-the-dice',
      color: '#fff2e2',
      intensity: 7.9,
      width: 0.28,
      height: 0.09,
      part: 'Label • ROLL THE DICE',
      offset: [0.022, 0.23, 0.019],
    },
    {
      id: 'watch',
      color: '#eaf4ff',
      intensity: 3.5,
      width: 0.32,
      height: 0.055,
      part: 'Watch • sculpted silver bowl',
      offset: [-0.1, 0.29, -0.11],
    },
  ],
  accents: [
    {
      part: 'Label • ROLL THE DICE',
      color: '#ffe6ba',
      intensity: 0.032,
    },
  ],
  directionals: [
    {
      id: 'key',
      color: '#fff3e3',
      intensity: 0.56,
      position: [-3, 6, -3],
      castShadow: true,
    },
    {
      id: 'fill',
      color: '#e9f2ff',
      intensity: 0.22,
      position: [3, 4, 2],
    },
    {
      id: 'rim',
      color: '#ffffff',
      intensity: 0.36,
      position: [1, 2, -5],
    },
  ],
};
