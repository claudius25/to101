import { Object3D, Quaternion, Vector3 } from 'three';

import { DiceRoll } from '../../services/dice.service';
import { Axis, DICE_CONFIG, DiceConfig, EASINGS, EasingName, WheelConfig } from './dice.config';

export type DiceMachineState = 'idle' | 'spinning' | 'settling';

const AXES: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/** Time-based tween between two numbers, restartable mid-flight. */
class Tween {
  value = 0;

  private from = 0;
  private to = 0;
  private elapsed = 0;
  private duration = 0;
  private ease = EASINGS.linear;

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

class Wheel {
  object: Object3D | null = null;

  private readonly basis = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly axis: Vector3;

  private angleDeg = 0;
  private speedDegPerSec = 0;

  private settleElapsed = 0;
  private settleFrom = 0;
  private settleTo = 0;
  private settleStarted = false;
  private spinning = false;
  private settling = false;

  constructor(private readonly config: WheelConfig) {
    this.axis = AXES[config.axis];
  }

  get done(): boolean {
    return !this.settling;
  }

  attach(object: Object3D): void {
    this.object = object;
    this.basis.copy(object.quaternion);

    if (this.config.restValue !== null) {
      this.angleDeg = this.faceAngle(this.config.restValue);
      this.apply();
    }
  }

  /** Resting rotation that puts `value` in the readable position. */
  faceAngle(value: number): number {
    const index = value - this.config.firstFaceValue;
    return this.config.offsetDeg + this.config.faceDirection * index * (360 / this.config.faceCount);
  }

  startSpin(): void {
    this.spinning = true;
    this.settling = false;
    this.settleStarted = false;
    this.settleElapsed = 0;
  }

  startSettle(value: number): void {
    this.settling = true;
    this.settleStarted = false;
    this.settleElapsed = 0;
    this.settleTo = this.faceAngle(value);
  }

  update(deltaMs: number): void {
    // A drum that is neither spinning nor settling must hold its face exactly.
    if (!this.spinning && !this.settling) {
      return;
    }

    if (!this.settling) {
      this.accelerate(deltaMs);
      this.angleDeg += this.speedDegPerSec * (deltaMs / 1000);
      this.apply();
      return;
    }

    this.settleElapsed += deltaMs;

    // Keep free-wheeling until this wheel's turn to slow down arrives.
    if (this.settleElapsed < this.config.settleDelayMs) {
      this.angleDeg += this.speedDegPerSec * (deltaMs / 1000);
      this.apply();
      return;
    }

    if (!this.settleStarted) {
      this.settleStarted = true;
      this.settleFrom = this.angleDeg;
      this.settleTo = this.resolveTarget(this.settleTo);
    }

    const elapsed = this.settleElapsed - this.config.settleDelayMs;
    const duration = Math.max(1, this.config.settleDurationMs);
    const t = Math.min(1, elapsed / duration);
    const eased = EASINGS[this.config.settleEasing](t);

    this.angleDeg = this.settleFrom + (this.settleTo - this.settleFrom) * eased;

    if (t >= 1) {
      this.settling = false;
      this.spinning = false;
      this.speedDegPerSec = 0;
      this.angleDeg = this.settleTo;
    }

    this.apply();
  }

  private accelerate(deltaMs: number): void {
    const top = this.config.spinSpeedDegPerSec * this.config.spinDirection;
    const rampMs = Math.max(1, this.config.spinUpMs);
    const stepPerMs = this.config.spinSpeedDegPerSec / rampMs;
    const step = stepPerMs * deltaMs * this.config.spinDirection;

    this.speedDegPerSec =
      this.config.spinDirection > 0
        ? Math.min(top, this.speedDegPerSec + step)
        : Math.max(top, this.speedDegPerSec + step);
  }

  /**
   * Nearest angle congruent to `faceAngle` that is at least `settleMinTurns`
   * further along in the direction of travel, so the drum never snaps backwards.
   */
  private resolveTarget(faceAngle: number): number {
    const direction = this.config.spinDirection;
    const minimum = this.settleFrom + direction * this.config.settleMinTurns * 360;
    const remainder = (((faceAngle - minimum) * direction) % 360 + 360) % 360;
    return minimum + direction * remainder;
  }

  private apply(): void {
    if (!this.object) {
      return;
    }

    this.spin.setFromAxisAngle(this.axis, (this.angleDeg * Math.PI) / 180);
    this.object.quaternion.copy(this.basis).multiply(this.spin);
  }
}

/**
 * Drives the pull lever and the two dice drums. Owns no Angular state: the host
 * component feeds it frame deltas and listens for the settled result.
 */
export class DiceMachine {
  onSettled: ((roll: DiceRoll) => void) | null = null;

  private readonly wheels: [Wheel, Wheel];
  private readonly lever = new Tween();
  private readonly leverBasis = new Quaternion();
  private readonly leverRest = new Vector3();
  private readonly leverSpin = new Quaternion();
  private readonly leverAxis: Vector3;

  private leverObject: Object3D | null = null;
  private state: DiceMachineState = 'idle';
  private pending: DiceRoll | null = null;
  private holdMs = 0;
  private releaseRequested = false;

  constructor(private readonly config: DiceConfig = DICE_CONFIG) {
    this.wheels = [new Wheel(config.wheelOne), new Wheel(config.wheelTwo)];
    this.leverAxis = AXES[config.lever.axis];
  }

  get currentState(): DiceMachineState {
    return this.state;
  }

  get ready(): boolean {
    return this.leverObject !== null && this.wheels.every((wheel) => wheel.object !== null);
  }

  /** Objects a pointer must hit to grab the lever. */
  get hitTargets(): Object3D[] {
    return this.leverObject ? [this.leverObject] : [];
  }

  /** Finds the lever and both drums inside the loaded model. Returns the names it missed. */
  attach(root: Object3D): string[] {
    const missing: string[] = [];

    const lever = findNode(root, this.config.lever.node);
    if (lever) {
      this.leverObject = lever;
      this.leverBasis.copy(lever.quaternion);
      this.leverRest.copy(lever.position);
    } else {
      missing.push(this.config.lever.node);
    }

    const wheelConfigs = [this.config.wheelOne, this.config.wheelTwo];
    this.wheels.forEach((wheel, index) => {
      const node = findNode(root, wheelConfigs[index].node);
      if (node) {
        wheel.attach(node);
      } else {
        missing.push(wheelConfigs[index].node);
      }
    });

    return missing;
  }

  press(roll: DiceRoll): void {
    if (this.state !== 'idle') {
      return;
    }

    this.state = 'spinning';
    this.pending = roll;
    this.holdMs = 0;
    this.releaseRequested = false;
    this.lever.start(1, this.config.lever.pressDurationMs, this.config.lever.pressEasing);

    for (const wheel of this.wheels) {
      wheel.startSpin();
    }
  }

  release(): void {
    if (this.state !== 'spinning') {
      return;
    }

    this.releaseRequested = true;
  }

  update(deltaMs: number): void {
    if (this.state === 'spinning') {
      this.holdMs += deltaMs;

      const { minSpinMs, maxHoldMs } = this.config.interaction;
      const heldLongEnough = this.holdMs >= minSpinMs;
      const timedOut = maxHoldMs > 0 && this.holdMs >= maxHoldMs;

      if ((this.releaseRequested && heldLongEnough) || timedOut) {
        this.beginSettle();
      }
    }

    this.lever.update(deltaMs);
    this.applyLever();

    for (const wheel of this.wheels) {
      wheel.update(deltaMs);
    }

    if (this.state === 'settling' && this.wheels.every((wheel) => wheel.done)) {
      this.state = 'idle';
      const roll = this.pending;
      this.pending = null;
      if (roll) {
        this.onSettled?.(roll);
      }
    }
  }

  private beginSettle(): void {
    this.state = 'settling';
    this.lever.start(0, this.config.lever.releaseDurationMs, this.config.lever.releaseEasing);

    const roll = this.pending;
    this.wheels[0].startSettle(roll ? roll.wheelOne : this.config.wheelOne.firstFaceValue);
    this.wheels[1].startSettle(roll ? roll.wheelTwo : this.config.wheelTwo.firstFaceValue);
  }

  private applyLever(): void {
    if (!this.leverObject) {
      return;
    }

    const amount = this.lever.value;
    const { pullAngleDeg, pullOffset } = this.config.lever;

    this.leverSpin.setFromAxisAngle(this.leverAxis, (pullAngleDeg * amount * Math.PI) / 180);
    this.leverObject.quaternion.copy(this.leverBasis).multiply(this.leverSpin);
    this.leverObject.position.set(
      this.leverRest.x + pullOffset.x * amount,
      this.leverRest.y + pullOffset.y * amount,
      this.leverRest.z + pullOffset.z * amount,
    );
  }
}

/**
 * three's GLTFLoader runs node names through `PropertyBinding.sanitizeNodeName`, which
 * turns every space into an underscore and strips `[ ] . : /`. Normalising both sides
 * lets the config keep using readable fragments like "middle 4".
 */
function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[[\].:/]/g, '')
    .replace(/[\s_]+/g, ' ')
    .trim();
}

function findNode(root: Object3D, fragment: string): Object3D | null {
  const needle = normaliseName(fragment);
  let exact: Object3D | null = null;
  let partial: Object3D | null = null;

  root.traverse((node) => {
    if (!node.name) {
      return;
    }

    const name = normaliseName(node.name);
    if (name === needle) {
      exact ??= node;
    } else if (name.includes(needle)) {
      partial ??= node;
    }
  });

  return exact ?? partial;
}
