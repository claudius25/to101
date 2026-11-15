import { QuickInstruction } from './quick-instruction';
import { ViewFrame } from '../view';

describe('QuickInstruction', () => {
  it('should paint, dismiss on its own touch, and reset for a new round', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const frame = { ctx, width: 600, height: 400, unit: 4 } as ViewFrame;
    const instruction = new QuickInstruction('Press ◀, ▼, ▶ to start');
    const text = spyOn(ctx, 'fillText').and.callThrough();
    instruction.paint(frame);
    expect(text).toHaveBeenCalled();
    expect(instruction.pointer({ id: 1, phase: 'down', x: 0, y: 300 })).toBeFalse();
    expect(instruction.visible).toBeTrue();
    expect(instruction.pointer({ id: 1, phase: 'down', x: 100, y: 30 })).toBeTrue();
    expect(instruction.visible).toBeFalse();
    text.calls.reset();
    instruction.paint(frame);
    expect(text).not.toHaveBeenCalled();
    instruction.reset();
    expect(instruction.visible).toBeTrue();
    instruction.paint(frame);
    instruction.dismiss();
    expect(instruction.visible).toBeFalse();
  });
});
