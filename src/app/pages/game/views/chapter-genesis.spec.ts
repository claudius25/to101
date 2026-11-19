import { Hero } from '../hero';
import { HeroSummary } from '../hero-summary';
import { ChapterGenesis } from './chapter-genesis';
import { HitRegistry, ViewFrame } from './view';

describe('Genesis blueprint summary', () => {
  function completeHero(): Hero {
    const hero = new Hero();
    hero.name = 'Andrei';
    Object.assign(hero.blueprint, {
      fitness: 'Fit', finance: 'Stable', personality: 'openness',
      socialSkill: 'Friendly', luck: 'Lucky',
    });
    return hero;
  }

  it('describes all selected traits and follows hero resets', () => {
    const hero = completeHero();
    const summary = new HeroSummary(hero);
    expect(summary.ready).toBeTrue();
    const story = summary.paragraphs.join(' ');
    expect(story).toContain('Andrei has the energy and stamina');
    expect(story).toContain('His everyday needs are covered');
    expect(story).toContain('Curiosity draws him');
    expect(story).toContain('His friendly manner');
    expect(story).toContain('Chance often lends a hand');
    hero.blueprint.fitness = 'Frail';
    expect(summary.paragraphs[0]).toContain('tires easily');
    hero.reset();
    expect(summary.ready).toBeFalse();
    expect(summary.paragraphs).toEqual([]);
  });

  it('enables dot and arrow navigation after the traits settle', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const now = spyOn(performance, 'now').and.returnValue(0);
    const hero = completeHero();
    const chapter = new ChapterGenesis(hero);
    chapter.enter();
    expect(chapter.diceReady).toBeFalse();
    chapter.update(400);
    expect(chapter.key('right')).toBeFalse();
    now.and.returnValue(6000);
    hero.blueprint.luck = null;
    chapter.update(400);
    expect(chapter.key('right')).toBeFalse();
    expect(chapter.diceReady).toBeTrue();
    hero.blueprint.luck = 'Lucky';
    expect(chapter.diceReady).toBeFalse();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const text = spyOn(ctx, 'fillText');
    const translate = spyOn(ctx, 'translate').and.callThrough();
    const frame = {
      ctx, width: 600, height: 400, hit: new HitRegistry(),
    } as ViewFrame;
    chapter.paint(frame);
    expect(frame.hit.find(311, 380)).toBeNull();
    chapter.update(200);
    chapter.paint(frame);
    expect(frame.hit.find(289, 380)).toBe('stepper:0');
    expect(frame.hit.find(311, 380)).toBe('stepper:1');
    expect(chapter.key('right')).toBeTrue();
    expect(chapter.diceReady).toBeFalse();
    chapter.update(180);
    chapter.paint(frame);
    expect(translate).toHaveBeenCalledWith(-525, 0);
    expect(translate).toHaveBeenCalledWith(75, 0);
    expect(text.calls.allArgs().map(args => args[0]).join(' ')).toContain('Chance often lends a hand');
    chapter.update(180);
    frame.hit.reset();
    chapter.paint(frame);
    expect(chapter.canContinue).toBeTrue();
    chapter.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(hero.blueprint.luck).toBe('Lucky');

    expect(chapter.key('left')).toBeTrue();
    chapter.update(360);
    expect(chapter.diceReady).toBeFalse();
    text.calls.reset();
    chapter.paint(frame);
    expect(text).not.toHaveBeenCalled();
    chapter.press(frame.hit.find(311, 380)!);
    chapter.update(360);
    chapter.paint(frame);
    expect(text.calls.allArgs().map(args => args[0]).join(' ')).toContain('Chance often lends a hand');
    for (const [width, height] of [[600, 400], [360, 640]]) {
      text.calls.reset();
      chapter.paint({ ...frame, width, height });
      expect(text.calls.allArgs().map(args => args[0]).join(' ')).toBe(
        new HeroSummary(hero).paragraphs.join(' '),
      );
      for (const [, , y] of text.calls.allArgs()) {
        expect(y).toBeGreaterThanOrEqual(height * 0.06);
        expect(y).toBeLessThan(height * 0.88);
      }
    }
    chapter.press('stepper:0');
    chapter.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(hero.blueprint.luck).toBe('Lucky');
    chapter.update(360);
    chapter.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(hero.blueprint.luck).toBe('Lucky');
    expect(chapter.diceReady).toBeFalse();
    expect(chapter.key('right')).toBeTrue();
    chapter.dispose();
  });
});
