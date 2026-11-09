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

@Injectable({ providedIn: 'root' })
export class DiceService {
  private readonly config: DiceConfig = DICE_CONFIG;

  /** Picks a total and the pair of facets that will be shown to justify it. */
  roll(): DiceRoll {
    const first = faceValues(this.config.wheelOne);
    const second = faceValues(this.config.wheelTwo);

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
}
