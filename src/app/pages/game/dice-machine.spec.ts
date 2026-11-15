import { Group, Quaternion, Vector3 } from 'three';
import { DiceMachine } from './dice-machine';
import { DICE_CONFIG } from './dice.config';

describe('Dice wheel viewing angle', () => {
  it('should retain each viewing offset at rest and after settling on a result', () => {
    const config = structuredClone(DICE_CONFIG);
    config.wheelOne.viewOffsetDeg = 25;
    config.wheelTwo.viewOffsetDeg = -15;
    const model = new Group();
    const nodes = [config.lever, config.wheelOne, config.wheelTwo].map((part) => {
      const node = new Group();
      node.name = part.node;
      model.add(node);
      return node;
    });
    const machine = new DiceMachine(config);
    expect(machine.attach(model)).toEqual([]);
    const expectAngle = (index: number, degrees: number) => {
      const expected = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0), degrees * Math.PI / 180,
      );
      expect(nodes[index].quaternion.angleTo(expected)).toBeCloseTo(0, 6);
    };
    expectAngle(1, 25);
    expectAngle(2, -15);
    const settled = jasmine.createSpy('settled');
    machine.onSettled = settled;
    const roll = { total: 7, wheelOne: 2, wheelTwo: 5 };
    machine.press(roll);
    machine.update(500);
    machine.release();
    for (let i = 0; i < 30; i++) machine.update(100);
    expect(machine.currentState).toBe('idle');
    expect(settled).toHaveBeenCalledOnceWith(roll);
    expectAngle(1, config.wheelOne.offsetDeg + 2 * 360 / 7 + 25);
    expectAngle(2, config.wheelTwo.offsetDeg + 4 * 60 - 15);
  });
});
