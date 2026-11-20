import { ActivityProgress } from '../activities/activity-progress';
import { ageRange } from '../activities/age-range';
import { ActivitiesView } from './activities';
import { ChapterTidyBed } from './chapter-tidy-bed';
import { ChapterGenesis } from './chapter-genesis';
import { ChapterMouthClean } from './chapter-mouth-clean';
import { ChapterBabyDelivery } from './chapter-baby-delivery';
import { FINANCE_LEVELS, FITNESS_LEVELS, GENESIS_BOY_NAMES, LUCK_LEVELS, PERSONALITY_TYPES, SOCIAL_SKILL_LEVELS } from '../hero';
import { ScreenRouter } from './router';
import { HitRegistry, ViewFrame } from './view';

describe('Activity menu and progress', () => {
  let saved: Map<string, string>;

  beforeEach(() => {
    saved = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake((key) => saved.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => saved.set(key, value));
  });

  it('matches the configured age interval with an exclusive upper bound', () => {
    expect(ageRange(0)?.id).toBe('age-0');
    expect(ageRange(11)?.id).toBe('age-0');
    expect(ageRange(12)?.label).toBe('1');
    expect(ageRange(24)).toBeUndefined();
    expect(ageRange(-1)).toBeUndefined();
  });

  it('persists completion separately for each interval and activity', () => {
    const progress = new ActivityProgress();
    progress.complete('age-0-1', 'tidy-bed');
    const restored = new ActivityProgress();
    expect(restored.has('age-0-1', 'tidy-bed')).toBeTrue();
    expect(restored.has('age-0-1', 'mouth-clean')).toBeFalse();
    expect(restored.has('age-1-2', 'tidy-bed')).toBeFalse();
  });

  it('keeps progress usable when storage is corrupted or unavailable', () => {
    (Storage.prototype.getItem as jasmine.Spy).and.returnValue('{broken');
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Storage unavailable');
    const progress = new ActivityProgress();
    expect(() => progress.complete('age-0-1', 'tidy-bed')).not.toThrow();
    expect(progress.has('age-0-1', 'tidy-bed')).toBeTrue();
  });

  it('clears saved progress and returns to Genesis through the Settings reset', () => {
    new ActivityProgress().complete('age-0-1', 'tidy-bed');
    const router = new ScreenRouter();
    router.key('settings');
    expect(router.current).toBe('settings');

    router.key('enter');
    expect(router.current).toBe('activities');
    expect(router.depth).toBe(1);
    expect(new ActivityProgress().has('age-0-1', 'tidy-bed')).toBeFalse();
    router.key('enter');
    expect(router.current).toBe('chapter-genesis');
    router.dispose();
  });

  it('assigns the Genesis traits in order using the rolled levels', () => {
    expect(new Set(GENESIS_BOY_NAMES).size).toBe(100);
    expect(GENESIS_BOY_NAMES.every((name) => name.length <= 12)).toBeTrue();
    const router = new ScreenRouter();
    router.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(router.hero.name).toBe('');

    router.key('enter');
    router.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    const first = router.hero.name;
    expect(GENESIS_BOY_NAMES).toContain(first);
    expect(router.hero.blueprint.fitness).toBeNull();
    expect(router.diceInterval).toEqual({ min: 1, max: 5 });
    router.diceRolled({ total: 3, wheelOne: 1, wheelTwo: 2 });
    expect(router.hero.name).toBe(first);
    expect(router.hero.blueprint.fitness).toBe(FITNESS_LEVELS[2]);
    expect(router.hero.blueprint.finance).toBeNull();
    expect(router.diceInterval).toEqual({ min: 1, max: 5 });
    router.diceRolled({ total: 5, wheelOne: 2, wheelTwo: 3 });
    expect(router.hero.blueprint.finance).toBe(FINANCE_LEVELS[4]);
    expect(router.hero.blueprint.fitness).toBe(FITNESS_LEVELS[2]);
    expect(router.hero.blueprint.personality).toBeNull();
    router.diceRolled({ total: 5, wheelOne: 2, wheelTwo: 3 });
    expect(router.hero.blueprint.personality).toBe(PERSONALITY_TYPES[4].trait);
    expect(router.hero.blueprint.socialSkill).toBeNull();
    expect(router.diceInterval).toEqual({ min: 1, max: 5 });
    router.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(router.hero.blueprint.socialSkill).toBe(SOCIAL_SKILL_LEVELS[0]);
    expect(router.hero.blueprint.luck).toBeNull();
    router.diceRolled({ total: 5, wheelOne: 2, wheelTwo: 3 });
    expect(router.hero.blueprint.luck).toBe(LUCK_LEVELS[4]);
    expect(router.diceReady).toBeFalse();
    expect(router.hero.blueprint.socialSkill).toBe(SOCIAL_SKILL_LEVELS[0]);
    router.diceRolled({ total: 1, wheelOne: 0, wheelTwo: 1 });
    expect(router.hero.blueprint.luck).toBe(LUCK_LEVELS[4]);
    expect(router.hero.blueprint.personality).toBe(PERSONALITY_TYPES[4].trait);
    expect(router.hero.blueprint.finance).toBe(FINANCE_LEVELS[4]);

    router.reset();
    expect(router.hero.name).toBe('');
    expect(router.hero.blueprint.fitness).toBeNull();
    expect(router.hero.blueprint.finance).toBeNull();
    expect(router.hero.blueprint.personality).toBeNull();
    expect(router.hero.blueprint.socialSkill).toBeNull();
    expect(router.hero.blueprint.luck).toBeNull();
    router.dispose();
  });

  it('renders touch targets and opens the selected chapter with the keypad', () => {
    const progress = new ActivityProgress();
    const menu = new ActivitiesView(progress);
    const canvas = document.createElement('canvas');
    const frame = {
      ctx: canvas.getContext('2d')!, width: 600, height: 400, unit: 4,
      hit: new HitRegistry(), pressed: null,
    } as ViewFrame;
    menu.paint(frame);
    expect(frame.hit.find(38, 44)).toBe('age:0');
    expect(frame.hit.find(195, 44)).toBeNull();
    expect(frame.hit.find(150, 128)).toBe('activity:0');
    expect(frame.hit.find(450, 128)).toBe('activity:0');
    expect(frame.hit.find(300, 172)).toBeNull();
    expect(frame.hit.find(300, 216)).withContext('Baby delivery is locked until Genesis').toBeNull();
    expect(frame.hit.find(300, 90)).toBeNull();
    expect(frame.hit.find(300, 380)).toBeNull();
    const nav = jasmine.createSpyObj('nav', ['push']);
    menu.key('enter', nav);
    menu.press('activity:0', nav);
    expect(nav.push.calls.allArgs()).toEqual([['chapter-genesis'], ['chapter-genesis']]);

    menu.press('age:1', nav);
    expect(menu.selectedAge).toBe(0);
    progress.complete('age-0', 'genesis');
    menu.selectAge(12);
    expect(menu.selectedAge).toBe(0);
    frame.hit.reset();
    menu.paint(frame);
    expect(frame.hit.find(195, 44)).toBeNull();

    progress.complete('age-0', 'baby-delivery');
    frame.hit.reset();
    menu.paint(frame);
    const ageOne = frame.hit.find(195, 44);
    expect(ageOne).toBe('age:1');
    menu.press(ageOne!, nav);
    expect(menu.selectedAge).toBe(1);
    menu.press('activity:1', nav);
    expect(nav.push.calls.count()).toBe(2);
    menu.press('activity:0', nav);
    expect(nav.push).toHaveBeenCalledWith('chapter-tidy-bed');
    progress.complete('age-0-1', 'tidy-bed');
    menu.key('down', nav);
    menu.key('enter', nav);
    expect(nav.push).toHaveBeenCalledWith('chapter-mouth-clean');
    nav.push.calls.reset();
    menu.press('activity:0', nav);
    menu.key('up', nav);
    menu.key('enter', nav);
    expect(nav.push).not.toHaveBeenCalled();
    frame.hit.reset();
    menu.paint(frame);
    expect(frame.hit.find(300, 128)).toBeNull();
    expect(frame.hit.find(300, 216)).toBe('activity:1');
  });

  it('saves only completed chapters and returns to the menu through close', () => {
    new ActivityProgress().complete('age-0', 'genesis');
    new ActivityProgress().complete('age-0', 'baby-delivery');
    spyOn(ChapterTidyBed.prototype, 'enter');
    spyOn(ChapterTidyBed.prototype, 'update');
    const completed = spyOnProperty(ChapterTidyBed.prototype, 'completed', 'get').and.returnValue(false);
    const router = new ScreenRouter('chapter-genesis');
    expect(router.current).toBe('activities');
    router.push('chapter-genesis');
    router.go('chapter-baby-delivery');
    router.key('enter');
    expect(router.current).toBe('activities');
    router.push('chapter-tidy-bed');
    router.update(16);
    expect(new ActivityProgress().has('age-0-1', 'tidy-bed')).toBeFalse();
    completed.and.returnValue(true);
    router.update(16);
    expect(new ActivityProgress().has('age-0-1', 'tidy-bed')).toBeTrue();
    router.key('close');
    expect(router.current).toBe('activities');
    expect(router.depth).toBe(1);
    router.dispose();
  });

  it('blocks navigation until Genesis completes and preserves the unlock after reloading', () => {
    new ActivityProgress().complete('age-0', 'baby-delivery');
    const completed = spyOnProperty(ChapterGenesis.prototype, 'completed', 'get').and.returnValue(false);
    const router = new ScreenRouter();
    router.push('chapter-tidy-bed');
    router.go('chapter-mouth-clean');
    expect(router.current).toBe('activities');
    router.key('enter');
    router.update(16);
    expect(new ActivityProgress().isUnlocked('chapter-tidy-bed')).toBeFalse();
    completed.and.returnValue(true);
    router.update(16);
    router.key('close');
    router.push('chapter-mouth-clean');
    expect(router.current).toBe('activities');
    router.push('chapter-tidy-bed');
    expect(router.current).toBe('chapter-tidy-bed');
    expect(new ActivityProgress().isUnlocked('chapter-tidy-bed')).toBeTrue();
    router.dispose();
  });

  it('requires earlier activities even when old saves contain later completions', () => {
    const progress = new ActivityProgress();
    progress.complete('age-0-1', 'tidy-bed');
    expect(progress.isUnlocked('chapter-mouth-clean')).toBeFalse();
    progress.complete('age-0', 'genesis');
    expect(progress.isUnlocked('chapter-baby-delivery')).toBeTrue();
    expect(progress.isUnlocked('chapter-mouth-clean')).toBeFalse();
    progress.complete('age-0', 'baby-delivery');
    expect(progress.isUnlocked('chapter-mouth-clean')).toBeTrue();
    progress.reset();
    expect(progress.isUnlocked('chapter-genesis')).toBeTrue();
    expect(progress.isUnlocked('chapter-tidy-bed')).toBeFalse();
  });

  it('continues from the completed summary to the rest of its age with Enter', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    spyOn(ChapterBabyDelivery.prototype, 'enter');
    const now = spyOn(performance, 'now').and.returnValue(0);
    const router = new ScreenRouter();
    router.hero.name = 'Andrei';
    Object.assign(router.hero.blueprint, {
      fitness: 'Fit', finance: 'Stable', personality: 'openness',
      socialSkill: 'Friendly', luck: 'Lucky',
    });
    router.key('enter');
    now.and.returnValue(6000);
    router.update(400);
    router.key('right');
    router.update(360);
    router.key('enter');
    expect(router.current).toBe('activities');
    expect(router.depth).toBe(1);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const text = spyOn(ctx, 'fillText');
    router.paint({ ctx, width: 600, height: 400 } as Parameters<ScreenRouter['paint']>[0]);
    const labels = text.calls.allArgs().map(args => args[0]);
    expect(labels).toContain('Baby delivery');
    expect(labels).toContain('Genesis');
    expect(labels).not.toContain('Tidy bed');
    router.key('enter');
    expect(router.current).toBe('chapter-baby-delivery');
    router.dispose();
  });

  it('moves on to the next age once Baby delivery finishes age 0', () => {
    new ActivityProgress().complete('age-0', 'genesis');
    spyOn(ChapterBabyDelivery.prototype, 'enter');
    spyOn(ChapterBabyDelivery.prototype, 'update');
    spyOnProperty(ChapterBabyDelivery.prototype, 'completed', 'get').and.returnValue(true);
    const router = new ScreenRouter('chapter-baby-delivery');
    expect(router.current).toBe('chapter-baby-delivery');
    router.update(16);
    expect(new ActivityProgress().has('age-0', 'baby-delivery')).toBeTrue();
    router.key('enter');
    expect(router.current).toBe('activities');
    expect(router.activityMenuAge).toBe(1);
    router.key('enter');
    expect(router.current).toBe('chapter-tidy-bed');
    router.dispose();
  });

  it('returns from a finished Tidy Bed to its age menu and unlocks Mouth Clean with Enter', () => {
    new ActivityProgress().complete('age-0', 'genesis');
    new ActivityProgress().complete('age-0', 'baby-delivery');
    const router = new ScreenRouter('chapter-tidy-bed');
    router.key('enter');
    expect(router.current).toBe('chapter-tidy-bed');
    router.key('left');
    router.key('down');
    router.key('right');
    for (let frame = 0; frame < 200; frame++) router.update(60);
    router.key('enter');
    expect(router.current).toBe('activities');
    expect(router.depth).toBe(1);
    const progress = new ActivityProgress();
    expect(progress.has('age-0-1', 'tidy-bed')).toBeTrue();
    expect(progress.isUnlocked('chapter-mouth-clean')).toBeTrue();
    router.key('enter');
    expect(router.current).toBe('chapter-mouth-clean');
    router.dispose();
  });

  it('generates a complete hero and opens its story immediately from the dev shortcut', () => {
    spyOn(performance, 'now').and.returnValue(0);
    spyOn(ChapterBabyDelivery.prototype, 'enter');
    const random = spyOn(Math, 'random').and.returnValue(0);
    const router = new ScreenRouter();
    router.generateHeroSummary();
    expect(router.hero.name).toBe(GENESIS_BOY_NAMES[0]);
    expect(Object.values(router.hero.blueprint).every(value => value !== null)).toBeTrue();
    expect(router.diceReady).toBeFalse();
    expect(new ActivityProgress().has('age-0', 'genesis')).toBeTrue();
    const ctx = document.createElement('canvas').getContext('2d')!;
    const text = spyOn(ctx, 'fillText');
    router.paint({ ctx, width: 600, height: 400 } as Parameters<ScreenRouter['paint']>[0]);
    expect(text.calls.allArgs().map(args => args[0]).join(' ')).toContain('Aaron tires easily');

    random.and.returnValue(0.999);
    router.generateHeroSummary();
    expect(router.hero.name).toBe(GENESIS_BOY_NAMES[99]);
    text.calls.reset();
    router.paint({ ctx, width: 600, height: 400 } as Parameters<ScreenRouter['paint']>[0]);
    expect(text.calls.allArgs().map(args => args[0]).join(' ')).toContain('Vlad moves');
    router.key('enter');
    expect(router.current).toBe('activities');
    router.key('enter');
    expect(router.current).toBe('chapter-baby-delivery');
    router.dispose();
  });

  it('uses the shared Enter icon for completed activities that handle their own touches', () => {
    new ActivityProgress().complete('age-0', 'genesis');
    new ActivityProgress().complete('age-0', 'baby-delivery');
    const tidyComplete = spyOnProperty(ChapterTidyBed.prototype, 'completed', 'get').and.returnValue(false);
    const tidyPointer = spyOn(ChapterTidyBed.prototype, 'pointer').and.returnValue(true);
    spyOn(ChapterMouthClean.prototype, 'enter');
    spyOnProperty(ChapterMouthClean.prototype, 'completed', 'get').and.returnValue(true);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const frame = { ctx, width: 600, height: 400 } as Parameters<ScreenRouter['paint']>[0];
    const router = new ScreenRouter('chapter-tidy-bed');
    router.paint(frame);
    router.pointer('down', 1, 551, 380);
    expect(tidyPointer).toHaveBeenCalled();
    tidyComplete.and.returnValue(true);
    tidyPointer.calls.reset();
    router.paint(frame);
    router.pointer('down', 1, 551, 380);
    router.pointer('up', 1, 551, 380);
    expect(tidyPointer).not.toHaveBeenCalled();
    expect(router.current).toBe('activities');
    expect(new ActivityProgress().isUnlocked('chapter-mouth-clean')).toBeTrue();

    router.push('chapter-mouth-clean');
    router.paint(frame);
    router.pointer('down', 2, 551, 380);
    router.pointer('up', 2, 551, 380);
    expect(router.current).toBe('activities');
    expect(new ActivityProgress().has('age-0-1', 'mouth-clean')).toBeTrue();
    router.dispose();
  });
});
