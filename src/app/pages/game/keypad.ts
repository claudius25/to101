import { Object3D, Vector3 } from 'three';

import { KEYPAD_CONFIG, KeyDefinition, KeypadConfig } from './keypad.config';
import { AXES, Tween, findNode, isDescendantOf } from './rig-utils';

class Key {
  object: Object3D | null = null;

  private readonly rest = new Vector3();
  private readonly offset = new Vector3();
  private readonly tween = new Tween();
  private holdMs = 0;
  private held = false;

  constructor(
    readonly definition: KeyDefinition,
    private readonly config: KeypadConfig,
  ) {}

  get travel(): number {
    return this.definition.travelMetres ?? this.config.travelMetres;
  }

  get active(): boolean {
    return this.held || !this.tween.done || this.tween.value !== 0;
  }

  attach(object: Object3D): void {
    this.object = object;
    this.rest.copy(object.position);
  }

  press(): void {
    this.held = true;
    this.holdMs = 0;
    this.tween.start(1, this.config.pressDurationMs, this.config.pressEasing);
  }

  release(): boolean {
    if (!this.held) {
      return false;
    }
    this.held = false;
    this.tween.start(0, this.config.releaseDurationMs, this.config.releaseEasing);
    return true;
  }

  /** Returns true when the safety net let the key go on its own this frame. */
  update(deltaMs: number): boolean {
    if (!this.active) {
      return false;
    }

    let released = false;
    if (this.held) {
      this.holdMs += deltaMs;
      if (this.config.maxHoldMs > 0 && this.holdMs >= this.config.maxHoldMs) {
        released = this.release();
      }
    }

    this.tween.update(deltaMs);
    this.apply();
    return released;
  }

  private apply(): void {
    if (!this.object) {
      return;
    }

    // Travel along the cap's own down axis, so the keypad's slight tilt is respected.
    this.offset
      .copy(AXES[this.config.axis])
      .applyQuaternion(this.object.quaternion)
      .multiplyScalar(-this.travel * this.tween.value);

    this.object.position.copy(this.rest).add(this.offset);
  }
}

/** Animates the keypad caps so they depress and spring back like real keys. */
export class Keypad {
  onPress: ((id: string) => void) | null = null;
  /** Fires when a held key is let go, including the automatic safety release. */
  onRelease: ((id: string) => void) | null = null;

  private readonly keys: Key[];

  constructor(private readonly config: KeypadConfig = KEYPAD_CONFIG) {
    this.keys = config.keys.map((definition) => new Key(definition, config));
  }

  get ready(): boolean {
    return this.keys.some((key) => key.object !== null);
  }

  /** Finds every cap in the loaded model. Returns the node fragments it missed. */
  attach(root: Object3D): string[] {
    const missing: string[] = [];

    for (const key of this.keys) {
      const node = findNode(root, key.definition.node);
      if (node) {
        key.attach(node);
      } else {
        missing.push(key.definition.node);
      }
    }

    return missing;
  }

  /** The cap containing `object`, or null when the hit was somewhere else. */
  keyAt(object: Object3D): string | null {
    for (const key of this.keys) {
      if (key.object && isDescendantOf(object, key.object)) {
        return key.definition.id;
      }
    }
    return null;
  }

  press(id: string): void {
    const key = this.keys.find((candidate) => candidate.definition.id === id);
    if (!key || !key.object) {
      return;
    }

    key.press();
    this.onPress?.(id);
  }

  release(id: string): void {
    const key = this.keys.find((candidate) => candidate.definition.id === id);
    if (key?.release()) {
      this.onRelease?.(id);
    }
  }

  releaseAll(): void {
    for (const key of this.keys) {
      if (key.release()) {
        this.onRelease?.(key.definition.id);
      }
    }
  }

  update(deltaMs: number): void {
    for (const key of this.keys) {
      if (key.update(deltaMs)) {
        this.onRelease?.(key.definition.id);
      }
    }
  }
}
