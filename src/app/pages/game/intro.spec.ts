import { BoxGeometry, Group, Mesh } from 'three';

import { INTRO_CONFIG } from './intro.config';
import { Intro } from './intro';

const { durationMs, fullSpeedMs, restPitchDeg } = INTRO_CONFIG.flip;
/** Where the wind-up hands over to the settle: half the turn, at peak speed. */
const HANDOVER_MS = durationMs / 3;
const DEVICE_LENGTH = 0.105;

describe('Intro', () => {
  let intro: Intro;

  beforeEach(() => {
    intro = new Intro();
  });

  afterEach(() => {
    intro.dispose();
  });

  it('should wait face-down and still', () => {
    intro.update(1000);
    intro.update(5000);

    expect(intro.state).toBe('waiting');
    expect(intro.pending).toBeTrue();
    // The half-turn that shows the back, plus the resting tilt on top of it.
    expect(intro.pitch).toBe(180 + restPitchDeg);
    expect(intro.roll).toBe(0);
    expect(intro.lift).toBe(0);
    expect(intro.blurPx).toBe(0);
    // The display housing is still folded into the chassis.
    expect(intro.hingeAngle).toBe(0);
  });

  it('should hand the wind-up over to the settle at half the turn', () => {
    intro.start(0);
    intro.update(HANDOVER_MS);

    // eased = 0.5 on both sides of the split, with the blur at its ceiling.
    expect(intro.pitch).toBeCloseTo(270 + restPitchDeg * 0.5, 6);
    expect(intro.roll).toBeCloseTo(180, 6);
    expect(intro.blurPx).toBeCloseTo(INTRO_CONFIG.blur.maxPx, 6);

    // Past the split the turn only ever slows down.
    intro.update(HANDOVER_MS + 1);
    const settling = intro.blurPx;
    expect(settling).toBeLessThan(INTRO_CONFIG.blur.maxPx);

    intro.update(durationMs - 1);
    expect(intro.blurPx).toBeLessThan(settling);
  });

  it('should land dead on the game pose', () => {
    const entered = jasmine.createSpy('entered');
    intro.onFinished = entered;

    expect(intro.start(500)).toBeTrue();
    intro.update(500 + durationMs * 0.6);

    expect(intro.state).toBe('flipping');
    expect(intro.pitch).toBeGreaterThan(270);
    expect(intro.pitch).toBeLessThan(360);

    intro.update(500 + durationMs);

    expect(intro.state).toBe('open');
    expect(intro.finished).toBeTrue();
    expect(intro.pitch).toBe(0);
    expect(intro.roll).toBe(0);
    expect(intro.lift).toBe(0);
    expect(intro.blurPx).toBe(0);
    expect(entered).toHaveBeenCalledTimes(1);
  });

  it('should ignore repeated clicks while the flip plays', () => {
    intro.start(0);
    intro.update(durationMs / 2);
    const halfway = intro.pitch;

    expect(intro.start(0)).toBeFalse();
    expect(intro.pitch).toBe(halfway);

    intro.update(durationMs);

    expect(intro.state).toBe('open');
  });

  it('should replay at the full-speed override', () => {
    intro.start(0, fullSpeedMs);
    intro.update(fullSpeedMs);

    expect(intro.state).toBe('open');
    expect(intro.pitch).toBe(0);

    // The configured run is the slower one, and is unaffected by the override.
    intro.start(0);
    intro.update(fullSpeedMs);

    expect(intro.state).toBe('flipping');

    intro.update(durationMs);

    expect(intro.state).toBe('open');
  });

  it('should print the back, scale the hop and stand the display up', () => {
    const body = new Mesh(new BoxGeometry(0.056, 0.016, DEVICE_LENGTH));
    body.name = INTRO_CONFIG.bodyNode;
    const hinge = new Group();
    hinge.name = INTRO_CONFIG.hinge.node;
    const model = new Group();
    model.add(body, hinge);

    expect(intro.attach(model)).toEqual([]);
    // The traced plate is parented alongside the body it was taken from.
    expect(model.children.length).toBe(3);

    const { metres, referenceLength } = INTRO_CONFIG.hop;
    const peak = metres * (DEVICE_LENGTH / referenceLength);

    intro.start(0);
    intro.update(HANDOVER_MS);
    expect(intro.lift).toBeCloseTo(peak, 6);
    expect(intro.hingeAngle).toBeCloseTo(INTRO_CONFIG.hinge.openDeg * 0.5, 6);

    intro.update(durationMs);
    expect(intro.lift).toBe(0);
    // The housing is the one thing that stays put once the device has landed.
    expect(intro.hingeAngle).toBe(INTRO_CONFIG.hinge.openDeg);
    expect(hinge.rotation.x).toBeCloseTo((INTRO_CONFIG.hinge.openDeg * Math.PI) / 180, 6);
  });
});
