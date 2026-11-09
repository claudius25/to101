/**
 * Travel and timing for the keypad keys: the 3x2 grid of grey keys and the
 * double-height orange Enter key on the right.
 *
 * The caps are 11.75 mm across and only 1 mm tall, so `travelMetres` has to stay
 * well under a millimetre or a key will sink through the recessed surround.
 */

import { Axis, EasingName } from './rig-utils';

export interface KeyDefinition {
  /** Stable id reported when the key is pressed. */
  id: string;
  /** Substring of the key's node name in the GLB. */
  node: string;
  /** Optional per-key travel override, in metres. */
  travelMetres?: number;
}

export interface KeypadConfig {
  /** Local axis the caps travel along. Negative travel pushes them into the device. */
  axis: Axis;
  /** How far a key sinks when pressed, in metres. Cap height is 0.001. */
  travelMetres: number;
  /** Time to bottom out. Real keys snap down fast. */
  pressDurationMs: number;
  pressEasing: EasingName;
  /** Time to spring back. Slightly slower than the press reads best. */
  releaseDurationMs: number;
  releaseEasing: EasingName;
  /**
   * Safety net: release the key automatically after this long even if the
   * pointer-up never arrives. 0 disables it.
   */
  maxHoldMs: number;
  /** Keys, in reading order. */
  keys: KeyDefinition[];
}

export const KEYPAD_CONFIG: KeypadConfig = {
  axis: 'y',
  travelMetres: 0.0004,
  pressDurationMs: 55,
  pressEasing: 'easeOutQuad',
  releaseDurationMs: 130,
  releaseEasing: 'easeOutBack',
  maxHoldMs: 4000,
  keys: [
    { id: 'close', node: 'column 2 upper' },
    { id: 'left', node: 'column 2 lower' },
    { id: 'up', node: 'column 3 upper' },
    { id: 'down', node: 'column 3 lower' },
    { id: 'settings', node: 'column 4 upper' },
    { id: 'right', node: 'column 4 lower' },
    { id: 'enter', node: 'far right' },
  ],
};
