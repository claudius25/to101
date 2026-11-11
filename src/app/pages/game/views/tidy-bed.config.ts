/**
 * "Tidy bed": hold the three zones along the bottom of the photo to wipe the tidy room
 * in from the top, and lift a finger before a spider lands on it.
 *
 * Difficulty lives in `TUNING`, so a whole feel can be swapped by changing
 * `TIDY_BED_CONFIG.difficulty` (or by handing a different key to the view later, once
 * the game decides difficulty for itself).
 */

export type TidyBedDifficulty = 'gentle' | 'normal' | 'brisk';

export interface Range {
  min: number;
  max: number;
}

export interface TidyBedTuning {
  /** Reveal speed for one, two and three held zones, as a fraction of the photo per second. */
  revealRates: [number, number, number];
  /** How fast the reveal slides back up while nothing is held, per second. */
  rollbackRate: number;
  /** Seconds a spider takes to drop from above the photo onto the zones. */
  fallSeconds: Range;
  /** Quiet moment before the first spider of a round. */
  firstSpawnSeconds: number;
  /** Gap between spawns. */
  spawnSeconds: Range;
  /** How long a spider stays visible past the zone, as a multiple of its fall time. */
  lingerFactor: number;
}

export interface TidyBedConfig {
  difficulty: TidyBedDifficulty;
  /** Folders under `assets/tidy-bed/`. One is picked at random for each round. */
  sets: string[];
  /** File names inside a set folder. */
  beforeFile: string;
  afterFile: string;
  /** Red flash when a spider lands on a held zone. */
  hit: { opacity: number; durationMs: number };
  /** Rows shown on the e-ink strip while the chapter is on top. */
  briefing: { rows: string[]; character?: string };
  tuning: Record<TidyBedDifficulty, TidyBedTuning>;
}

export const TIDY_BED_CONFIG: TidyBedConfig = {
  difficulty: 'normal',
  sets: ['1', '2', '3', '4', '5'],
  beforeFile: 'before.png',
  afterFile: 'after.jpg',
  hit: { opacity: 0.26, durationMs: 560 },
  briefing: {
    rows: [
      'Hold a point to start. More fingers reveal faster.',
      'Lift a finger before a spider reaches it.',
      'Releasing all three rolls the reveal back.',
    ],
    character: 'assets/e-ink/bed.png',
  },
  tuning: {
    gentle: {
      revealRates: [0.055, 0.095, 0.14],
      rollbackRate: 0.6,
      fallSeconds: { min: 2.2, max: 2.9 },
      firstSpawnSeconds: 1.6,
      spawnSeconds: { min: 0.9, max: 1.8 },
      lingerFactor: 1.31,
    },
    // The numbers Spider Sweep ships with.
    normal: {
      revealRates: [0.041, 0.073, 0.11],
      rollbackRate: 0.83,
      fallSeconds: { min: 1.65, max: 2.2 },
      firstSpawnSeconds: 1.1,
      spawnSeconds: { min: 0.58, max: 1.27 },
      lingerFactor: 1.31,
    },
    brisk: {
      revealRates: [0.035, 0.062, 0.095],
      rollbackRate: 1,
      fallSeconds: { min: 1.25, max: 1.65 },
      firstSpawnSeconds: 0.8,
      spawnSeconds: { min: 0.42, max: 0.95 },
      lingerFactor: 1.31,
    },
  },
};
