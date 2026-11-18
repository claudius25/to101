import { ActivityProgress } from '../activities/activity-progress';
import { ageRange } from '../activities/age-range';
import { ActivitiesView } from './activities';
import { ChapterTidyBed } from './chapter-tidy-bed';
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
    expect(ageRange(0)?.id).toBe('age-0-1');
    expect(ageRange(11)?.id).toBe('age-0-1');
    expect(ageRange(12)).toBeUndefined();
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

  it('renders touch targets and opens the selected chapter with the keypad', () => {
    const menu = new ActivitiesView(new ActivityProgress());
    const canvas = document.createElement('canvas');
    const frame = {
      ctx: canvas.getContext('2d')!, width: 600, height: 400, unit: 4,
      hit: new HitRegistry(), pressed: null,
    } as ViewFrame;
    menu.paint(frame);
    expect(frame.hit.find(250, 100)).toBe('activity:0');
    const nav = jasmine.createSpyObj('nav', ['push']);
    menu.key('right', nav);
    menu.key('enter', nav);
    expect(nav.push).toHaveBeenCalledWith('chapter-mouth-clean');
    menu.press('activity:0', nav);
    expect(nav.push).toHaveBeenCalledWith('chapter-tidy-bed');
  });

  it('saves only completed chapters and returns to the menu through close', () => {
    spyOn(ChapterTidyBed.prototype, 'enter');
    spyOn(ChapterTidyBed.prototype, 'update');
    const completed = spyOnProperty(ChapterTidyBed.prototype, 'completed', 'get').and.returnValue(false);
    const router = new ScreenRouter();
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
});
