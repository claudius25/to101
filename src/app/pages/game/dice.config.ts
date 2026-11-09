/**
 * Everything tunable about the "ROLL THE DICE" lever and the two dice wheels.
 *
 * The three moving parts are found by name inside the GLB:
 *   lever    -> "Button • middle 4 • integrated pull fin"
 *   wheelOne -> "Button • middle 2 • shortened for orange 5 mm wheel"  (faces 0-6)
 *   wheelTwo -> "Button • middle 3 • 21.25 mm"                         (faces 1-6)
 *
 * Node lookups are substring matches, so the short fragments below are enough.
 */

export type Axis = 'x' | 'y' | 'z';
export type Spin = 1 | -1;

export type EasingName =
  | 'linear'
  | 'easeOutQuad'
  | 'easeOutCubic'
  | 'easeOutQuint'
  | 'easeInOutCubic'
  | 'easeOutBack'
  | 'easeOutElastic';

/** `uniform-total` makes every total 1-12 equally likely; `uniform-faces` rolls two real dice. */
export type RollDistribution = 'uniform-total' | 'uniform-faces';

export interface LeverConfig {
  /** Substring of the lever node name. */
  node: string;
  /** Local axis the lever pivots around. */
  axis: Axis;
  /** How far the lever swings when pulled, in degrees. Flip the sign to pull the other way. */
  pullAngleDeg: number;
  /** Extra local translation at full pull, in metres (the model is ~0.1 m long). */
  pullOffset: { x: number; y: number; z: number };
  /** Time to reach the fully-pulled pose. */
  pressDurationMs: number;
  pressEasing: EasingName;
  /** Time to spring back to rest after release. */
  releaseDurationMs: number;
  /** `easeOutBack` gives a springy overshoot on the way home. */
  releaseEasing: EasingName;
}

export interface WheelConfig {
  /** Substring of the wheel node name. */
  node: string;
  /** Local axis the wheel spins around. */
  axis: Axis;
  /** Number of facets on the drum. */
  faceCount: number;
  /** Value printed on the facet that sits at `offsetDeg`. */
  firstFaceValue: number;
  /**
   * Calibration: rotation in degrees that brings `firstFaceValue` to the readable
   * (upward-facing) facet. Derived from the GLB geometry — see the defaults below.
   */
  offsetDeg: number;
  /** Whether increasing face values run clockwise (1) or anticlockwise (-1) around the drum. */
  faceDirection: Spin;
  /** Face to show before the first roll. `null` leaves the drum exactly as modelled. */
  restValue: number | null;
  /** Direction the drum spins while the lever is held. */
  spinDirection: Spin;
  /** Top speed while spinning, in degrees per second. */
  spinSpeedDegPerSec: number;
  /** Time to accelerate from rest to top speed. */
  spinUpMs: number;
  /** Wait this long after release before this wheel begins to slow down (stagger the stops). */
  settleDelayMs: number;
  /** How long the slow-down takes. */
  settleDurationMs: number;
  /** Minimum full turns to complete while slowing down, so the stop never looks abrupt. */
  settleMinTurns: number;
  settleEasing: EasingName;
}

export interface DiceConfig {
  lever: LeverConfig;
  wheelOne: WheelConfig;
  wheelTwo: WheelConfig;
  roll: {
    /** Lowest total the service may produce. */
    min: number;
    /** Highest total the service may produce. */
    max: number;
    distribution: RollDistribution;
  };
  interaction: {
    /** Hold the lever for at least this long, even on a quick tap, so the spin reads. */
    minSpinMs: number;
    /** Auto-release after this long. 0 disables the safety release. */
    maxHoldMs: number;
    /** Allow pressing anywhere on the device instead of only the lever. */
    pressAnywhere: boolean;
  };
}

export const DICE_CONFIG: DiceConfig = {
  lever: {
    node: 'middle 4',
    axis: 'y',
    // Positive swings the orange fin from upright towards the keypad, i.e. towards you.
    pullAngleDeg: 30,
    pullOffset: { x: 0, y: 0, z: 0 },
    pressDurationMs: 130,
    pressEasing: 'easeOutCubic',
    releaseDurationMs: 420,
    releaseEasing: 'easeOutBack',
  },

  wheelOne: {
    node: 'middle 2',
    axis: 'y',
    // Seven facets 51.43° apart: the blank one is 0, then 1-6 pips.
    faceCount: 7,
    firstFaceValue: 0,
    // -1080/7: the blank facet sits 154.29° from the upward-facing position.
    offsetDeg: -154.2857,
    faceDirection: 1,
    restValue: null,
    spinDirection: 1,
    spinSpeedDegPerSec: 1440,
    spinUpMs: 180,
    settleDelayMs: 0,
    settleDurationMs: 1100,
    settleMinTurns: 2,
    settleEasing: 'easeOutQuint',
  },

  wheelTwo: {
    node: 'middle 3',
    axis: 'y',
    // Six facets 60° apart, 1-6 pips.
    faceCount: 6,
    firstFaceValue: 1,
    offsetDeg: 60,
    faceDirection: 1,
    restValue: null,
    spinDirection: 1,
    spinSpeedDegPerSec: 1620,
    spinUpMs: 180,
    settleDelayMs: 260,
    settleDurationMs: 1250,
    settleMinTurns: 3,
    settleEasing: 'easeOutQuint',
  },

  roll: {
    min: 1,
    max: 12,
    distribution: 'uniform-total',
  },

  interaction: {
    minSpinMs: 450,
    maxHoldMs: 0,
    pressAnywhere: false,
  },
};

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeOutQuad: (t) => 1 - (1 - t) ** 2,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeOutQuint: (t) => 1 - (1 - t) ** 5,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutBack: (t) => {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) {
      return t;
    }
    const period = (2 * Math.PI) / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * period) + 1;
  },
};

/** Every value a wheel can show, in facet order. */
export function faceValues(wheel: WheelConfig): number[] {
  return Array.from({ length: wheel.faceCount }, (_, index) => wheel.firstFaceValue + index);
}
