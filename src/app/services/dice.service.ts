import { Injectable } from '@angular/core';

import { DICE_CONFIG, DiceConfig, faceValues } from '../pages/game/dice.config';

export interface DiceRoll {
  /** The number the device reports, i.e. the two wheels added together. */
  total: number;
  /** Face shown by the first wheel (0-6 by default). */
  wheelOne: number;
  /** Face shown by the second wheel (1-6 by default). */
  wheelTwo: number;
}

export interface DiceInterval {
  min: number;
  max: number;
}

@Injectable({ providedIn: 'root' })
export class DiceService {
  private readonly config: DiceConfig = DICE_CONFIG;
  private readyState = false;

  get ready(): boolean {
    return this.readyState;
  }

  setReady(ready: boolean): void {
    this.readyState = ready;
  }

  /** Picks a total and the pair of facets that will be shown to justify it. */
  roll(interval?: DiceInterval): DiceRoll | null {
    if (!this.readyState) return null;
    const roll = this.generateRoll(interval);
    this.readyState = false;
    return roll;
  }

  private generateRoll(interval?: DiceInterval): DiceRoll {
    const first = faceValues(this.config.wheelOne);
    const second = faceValues(this.config.wheelTwo);

    if (interval) {
      return this.rollInterval(first, second, interval);
    }

    if (this.config.roll.distribution === 'uniform-faces') {
      return this.rollFaces(first, second);
    }

    const { min, max } = this.config.roll;
    const total = min + Math.floor(Math.random() * (max - min + 1));

    const pairs: Array<[number, number]> = [];
    for (const one of first) {
      for (const two of second) {
        if (one + two === total) {
          pairs.push([one, two]);
        }
      }
    }

    if (pairs.length === 0) {
      // The configured range and the facets disagree; a real pair beats an impossible total.
      return this.rollFaces(first, second);
    }

    const [wheelOne, wheelTwo] = pairs[Math.floor(Math.random() * pairs.length)];
    return { total, wheelOne, wheelTwo };
  }

  private rollFaces(first: number[], second: number[]): DiceRoll {
    const wheelOne = first[Math.floor(Math.random() * first.length)];
    const wheelTwo = second[Math.floor(Math.random() * second.length)];
    return { total: wheelOne + wheelTwo, wheelOne, wheelTwo };
  }

  private rollInterval(first: number[], second: number[], { min, max }: DiceInterval): DiceRoll {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError('Dice interval must have ordered integer bounds.');
    }
    const pairsByTotal = new Map<number, DiceRoll[]>();
    for (const wheelOne of first) {
      for (const wheelTwo of second) {
        const total = wheelOne + wheelTwo;
        if (total < min || total > max) continue;
        const pairs = pairsByTotal.get(total) ?? [];
        pairs.push({ total, wheelOne, wheelTwo });
        pairsByTotal.set(total, pairs);
      }
    }
    if (pairsByTotal.size !== max - min + 1) {
      throw new RangeError('Dice interval contains totals the wheels cannot display.');
    }
    const total = min + Math.floor(Math.random() * (max - min + 1));
    const pairs = pairsByTotal.get(total)!;
    return pairs[Math.floor(Math.random() * pairs.length)];
  }
}
