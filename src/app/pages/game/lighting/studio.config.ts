/**
 * Studio look for the aluminium device: lighting *and* materials.
 *
 * All the light comes from one image-based "virtual photo studio" — softboxes, strip lights
 * and bounce cards rendered once into a pre-filtered environment map (PMREM) when the rig is
 * prepared. Nothing in it is evaluated per light per pixel, so it costs the same as a single
 * environment lookup however many softboxes there are: no RectAreaLights, no real-time
 * shadow pass. That is what keeps the device at 50–60 fps at full resolution.
 *
 * Coordinates are in *device space*: +Y points out of the front face, +X toward the side
 * wheels and +Z toward the keypad. With `followDevice` on, the studio turns with the frame the
 * model sits in, so highlights stay on the keypad and the rollers however the device is posed.
 * The studio's units are arbitrary: only directions and sizes as seen from the device matter.
 */

export type Vec3 = [number, number, number];

/** A light source painted into the environment: a softbox, a strip light or a bounce card. */
export interface Softbox {
  id: string;
  shape: 'rect' | 'disc';
  /** Across the panel. For a disc, its diameter. */
  width: number;
  /** Along the panel. Ignored for a disc. */
  height: number;
  /** Where it hangs; it always faces the device. */
  position: Vec3;
  /** Brightness multiplier on `color` (HDR: above 1 is brighter than white). */
  intensity: number;
  color: string;
  /** Optional vertical fade from full brightness at the top to black at the bottom. */
  gradient?: boolean;
}

export interface StudioEnvironment {
  /** Colour and brightness of the room behind the lights: what the metal reflects between them. */
  room: { color: string; intensity: number };
  /** A large disc below the device; lights undersides and the lower edges. */
  floor: { color: string; intensity: number; depth: number } | null;
  softboxes: Softbox[];
  /** PMREM blur. Small: the softboxes stay readable in the polished parts. */
  blur: number;
}

/**
 * How a material from the GLB is re-dressed. Matched by prefix against the material name;
 * the first match wins. Anything unmatched keeps the file's colour and finish, moved onto a
 * plain `MeshStandardMaterial` so no costly glTF extension rides along by accident.
 */
export interface MaterialRecipe {
  match: string;
  /** `physical` only where a clear coat is needed (the glass); everything else stays standard. */
  kind?: 'standard' | 'physical';
  color?: string;
  metalness?: number;
  roughness?: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Fine bead-blast grain: strength of the generated normal map (about 0.03–0.08). */
  grain?: number;
  /** Also vary roughness with the grain (worth it on large bead-blasted panels only). */
  grainRoughness?: boolean;
  /** Concentric machining rings on round caps: grooves from centre to rim. */
  machined?: number;
}

/** Makes one named part glow without touching anything that shares its material. */
export interface EmissiveAccent {
  part: string;
  color: string;
  intensity: number;
}

export interface DirectionalLightSpec {
  id: string;
  color: string;
  intensity: number;
  /** Aimed at the device centre; quoted against `referenceLength`. */
  position: Vec3;
  castShadow?: boolean;
}

export interface StudioPreset {
  /** Device length along Z that light positions were authored against. */
  referenceLength: number;
  /** `neutral` is Khronos PBR Neutral: true-to-colour product rendering. */
  toneMapping: 'neutral' | 'aces' | 'agx';
  toneMappingExposure: number;
  environmentIntensity: number;
  /** Turn the studio with the device's frame, so highlights stay put on the device. */
  followDevice: boolean;
  environment: StudioEnvironment;
  materials: MaterialRecipe[];
  accents: EmissiveAccent[];
  /**
   * Optional punctual lights on top of the studio. Empty by default: each one is paid per
   * pixel, and a shadow-casting one adds a whole extra render of the device every frame.
   */
  directionals: DirectionalLightSpec[];
  shadows: { enabled: boolean; mapSize: number; normalBias: number };
}

export const STUDIO_PRESET: StudioPreset = {
  referenceLength: 2.55,
  toneMapping: 'neutral',
  toneMappingExposure: 1.05,
  environmentIntensity: 1,
  followDevice: true,
  environment: {
    // A dark studio, tinted toward the page's navy backdrop.
    room: { color: '#14151c', intensity: 1 },
    floor: { color: '#1b1c24', intensity: 0.6, depth: 2.5 },
    blur: 0.025,
    softboxes: [
      // Broad overhead softbox: the even sheen across the front face.
      {
        id: 'overhead',
        shape: 'disc',
        width: 11,
        height: 11,
        position: [0, 9, 0.5],
        intensity: 2.6,
        color: '#fff8f0',
      },
      // Warm key, front-left.
      {
        id: 'key',
        shape: 'rect',
        width: 6,
        height: 7,
        position: [-6, 5, 4],
        intensity: 5,
        color: '#fff1e2',
      },
      // Thin strips behind: the crisp highlights along machined edges.
      {
        id: 'strip-left',
        shape: 'rect',
        width: 0.6,
        height: 9,
        position: [-7, 2, -3],
        intensity: 10,
        color: '#ffffff',
      },
      {
        id: 'strip-right',
        shape: 'rect',
        width: 0.6,
        height: 9,
        position: [7, 2.5, -2],
        intensity: 9,
        color: '#e8f0ff',
      },
      // Front fill card.
      {
        id: 'front-fill',
        shape: 'rect',
        width: 10,
        height: 3.5,
        position: [1, 1.5, 8],
        intensity: 2.4,
        color: '#ffffff',
      },
      // Low softboxes either side, warm right and cool left: the side walls stay silver.
      {
        id: 'side-right',
        shape: 'rect',
        width: 7,
        height: 5,
        position: [8.5, 1.2, 3.5],
        intensity: 3.2,
        color: '#fff6ee',
      },
      {
        id: 'side-left',
        shape: 'rect',
        width: 8,
        height: 5,
        position: [-8.5, 1.2, 1],
        intensity: 3,
        color: '#eef3ff',
      },
      // Low bounce cards all round: what the side walls and the front edge reflect, so none goes black.
      {
        id: 'bounce-back-right',
        shape: 'rect',
        width: 10,
        height: 5,
        position: [6.5, -2, -6.5],
        intensity: 2.6,
        color: '#fff4ea',
      },
      {
        id: 'bounce-front-left',
        shape: 'rect',
        width: 10,
        height: 5,
        position: [-6.5, -2, 6.5],
        intensity: 1.8,
        color: '#fff4ea',
      },
      {
        id: 'bounce-back-left',
        shape: 'rect',
        width: 10,
        height: 5,
        position: [-6.5, -2, -6.5],
        intensity: 2.4,
        color: '#f1f4ff',
      },
      {
        id: 'bounce-front-right',
        shape: 'rect',
        width: 10,
        height: 5,
        position: [6.5, -2, 6.5],
        intensity: 1.8,
        color: '#fff4ea',
      },
      // Big gradient card high behind: a soft sheen across the black glass.
      {
        id: 'glass-sheen',
        shape: 'rect',
        width: 14,
        height: 6,
        position: [0, 6, -8],
        intensity: 2.2,
        color: '#ffffff',
        gradient: true,
      },
    ],
  },
  materials: [
    // Bead-blasted aluminium: the file leaves roughness/metalness at the glTF default (1, 1),
    // which reads as flat grey. This is a light silver with a fine grain.
    {
      match: 'Aluminium',
      color: '#d2d6db',
      metalness: 1,
      roughness: 0.38,
      grain: 0.06,
      grainRoughness: true,
    },
    {
      match: 'Display',
      kind: 'physical',
      color: '#050607',
      metalness: 0,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.2,
    },
    { match: 'E-ink • paper', color: '#dedcd2', metalness: 0, roughness: 0.94 },
    { match: 'E-ink • charcoal', color: '#151618', metalness: 0, roughness: 0.7 },
    {
      match: 'Orange',
      color: '#ff5a1f',
      metalness: 0.9,
      roughness: 0.3,
      envMapIntensity: 1.1,
      machined: 22,
    },
    { match: 'Dice cylinders', color: '#1a1c1f', metalness: 0.7, roughness: 0.3, machined: 24 },
    {
      match: 'Status keys • satin silver',
      color: '#d2d5d9',
      metalness: 1,
      roughness: 0.28,
      machined: 14,
    },
    {
      match: 'Status keys • mint',
      color: '#7df2b4',
      metalness: 0,
      roughness: 0.3,
      emissive: '#5dffa8',
      emissiveIntensity: 1.6,
    },
    {
      match: 'Keycap • warm champagne',
      color: '#d49058',
      metalness: 0.95,
      roughness: 0.34,
      grain: 0.04,
    },
    {
      match: 'Keycaps • satin graphite',
      color: '#9aa0a8',
      metalness: 0.9,
      roughness: 0.45,
      grain: 0.04,
    },
  ],
  accents: [
    {
      part: 'Label • ROLL THE DICE',
      color: '#ffe6ba',
      intensity: 0.032,
    },
  ],
  directionals: [],
  shadows: { enabled: false, mapSize: 2048, normalBias: 0.02 },
};
