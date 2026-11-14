/**
 * The reveal that opens the game.
 *
 * The device waits face-down, showing the launcher artwork printed across its back.
 * One click or tap flips it end over end while it rolls about its own long axis and
 * hops toward the camera, and the game becomes live the moment it settles on its
 * front face.
 *
 * The flip's angles are *offsets* added to the resting pose in `device-view.config.ts`,
 * so the reveal always lands exactly on the framing the game plays at.
 */

export interface IntroConfig {
  /** Device body. Its flat back face is traced to make the printed plate. */
  bodyNode: string;
  art: {
    url: string;
    /**
     * How far the printed plate sits off the back face, as a fraction of the device's
     * thickness. Just enough to beat depth fighting, far too little to see edge-on.
     */
    lift: number;
    /**
     * Self-lit share of the artwork. Every light in the studio rig faces the front of
     * the device, so the back needs to carry its own brightness; the map is still fed
     * to `map` as well, which is what picks up the sheen as the device turns.
     */
    emissive: number;
    roughness: number;
    metalness: number;
  };
  flip: {
    /** Exactly how long one reveal runs, in milliseconds. */
    durationMs: number;
    /** The studio's quarter-speed preview, replayable from the dev panel. */
    previewDurationMs: number;
  };
  /** Hop toward the camera, peaking halfway through the turn. */
  hop: {
    /**
     * Height at the top of the arc. Quoted, like the studio lighting rig, against a
     * device `referenceLength` long on Z; the real model is measured when the plate is
     * traced and the height scaled by the ratio.
     */
    metres: number;
    referenceLength: number;
  };
  blur: {
    /** Motion blur at peak speed, in CSS pixels. Follows the flip's own speed curve. */
    maxPx: number;
  };
}

export const INTRO_CONFIG: IntroConfig = {
  bodyNode: 'Device • recessed 6 mm channel',
  art: {
    url: 'assets/launcher.png',
    lift: 0.004,
    emissive: 1.05,
    roughness: 0.52,
    metalness: 0.05,
  },
  flip: {
    durationMs: 1050,
    previewDurationMs: 4200,
  },
  hop: {
    metres: 0.14,
    referenceLength: 2.55,
  },
  blur: {
    maxPx: 3,
  },
};
