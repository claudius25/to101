import { DiceService } from './dice.service';
import { DICE_CONFIG, faceValues } from '../pages/game/dice.config';

describe('Dice interval rolls', () => {
  it('produces each requested total with matching physical wheel faces', () => {
    const dice = new DiceService();
    const random = spyOn(Math, 'random');
    for (let expected = 1; expected <= 5; expected++) {
      dice.setReady(true);
      random.and.returnValues((expected - 1) / 5 + 0.01, 0);
      const roll = dice.roll({ min: 1, max: 5 })!;
      expect(roll.total).toBe(expected);
      expect(roll.wheelOne + roll.wheelTwo).toBe(expected);
      expect(faceValues(DICE_CONFIG.wheelOne)).toContain(roll.wheelOne);
      expect(faceValues(DICE_CONFIG.wheelTwo)).toContain(roll.wheelTwo);
    }
  });

  it('rejects invalid intervals and values the wheels cannot display', () => {
    const dice = new DiceService();
    dice.setReady(true);
    for (const interval of [{ min: 5, max: 1 }, { min: 1.5, max: 5 }, { min: 0, max: 5 }]) {
      expect(() => dice.roll(interval)).toThrowError(RangeError);
    }
  });

  it('ignores rolls until ready and consumes readiness after one result', () => {
    const dice = new DiceService();
    const random = spyOn(Math, 'random').and.returnValue(0);
    expect(dice.ready).toBeFalse();
    expect(dice.roll()).toBeNull();
    expect(random).not.toHaveBeenCalled();
    dice.setReady(true);
    expect(dice.roll({ min: 1, max: 5 })?.total).toBe(1);
    expect(dice.ready).toBeFalse();
    expect(dice.roll()).toBeNull();
  });
});
