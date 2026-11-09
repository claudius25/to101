import { Object3D, Vector3 } from 'three';

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

export const AXES: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/**
 * three's GLTFLoader runs node names through `PropertyBinding.sanitizeNodeName`, which
 * turns every space into an underscore and strips `[ ] . : /`. Normalising both sides
 * lets configs keep using readable fragments like "middle 4" or "column 3 upper".
 */
export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[[\].:/]/g, '')
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/** Whole words only, so "2" never matches inside "2125". */
function tokenise(value: string): string[] {
  return normaliseName(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * True when every token of `needle` appears in `haystack` in order, as whole words.
 * Model names are decorated ("Key • column 2 • upper grey"), so a config can say
 * "column 2 upper" without reproducing the bullets.
 */
function matchesTokens(haystack: string[], needle: string[]): boolean {
  let cursor = 0;
  for (const token of needle) {
    cursor = haystack.indexOf(token, cursor);
    if (cursor === -1) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

export function findNode(root: Object3D, fragment: string): Object3D | null {
  const needleName = normaliseName(fragment);
  const needleTokens = tokenise(fragment);
  let exact: Object3D | null = null;
  let partial: Object3D | null = null;

  root.traverse((node) => {
    if (!node.name) {
      return;
    }

    if (normaliseName(node.name) === needleName) {
      exact ??= node;
    } else if (matchesTokens(tokenise(node.name), needleTokens)) {
      partial ??= node;
    }
  });

  return exact ?? partial;
}

/** True when `object` is `ancestor` or sits underneath it. */
export function isDescendantOf(object: Object3D, ancestor: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/** Time-based tween between two numbers, restartable mid-flight. */
export class Tween {
  value = 0;

  private from = 0;
  private to = 0;
  private elapsed = 0;
  private duration = 0;
  private ease = EASINGS.linear;

  get done(): boolean {
    return this.elapsed >= this.duration;
  }

  start(to: number, durationMs: number, easing: EasingName): void {
    this.from = this.value;
    this.to = to;
    this.elapsed = 0;
    this.duration = Math.max(0, durationMs);
    this.ease = EASINGS[easing];

    if (this.duration === 0) {
      this.value = to;
    }
  }

  update(deltaMs: number): void {
    if (this.duration === 0 || this.elapsed >= this.duration) {
      this.value = this.to;
      return;
    }

    this.elapsed = Math.min(this.elapsed + deltaMs, this.duration);
    this.value = this.from + (this.to - this.from) * this.ease(this.elapsed / this.duration);
  }
}
