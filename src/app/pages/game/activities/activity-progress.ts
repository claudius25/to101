const STORAGE_KEY = 'to101.activity-progress.v1';

export class ActivityProgress {
  private readonly completed = new Set<string>();

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        for (const key of saved) {
          if (typeof key === 'string') this.completed.add(key);
        }
      }
    } catch {
      // Progress remains available in memory when browser storage is unavailable.
    }
  }

  has(rangeId: string, activityId: string): boolean {
    return this.completed.has(`${rangeId}/${activityId}`);
  }

  isAgeUnlocked(range: AgeRange): boolean {
    const index = AGE_RANGES.indexOf(range);
    return index >= 0 && AGE_RANGES.slice(0, index).every((earlier) =>
      earlier.activities.every((activity) => this.has(earlier.id, activity.id)),
    );
  }

  canStart(view: ViewId): boolean {
    const range = AGE_RANGES.find((entry) => entry.activities.some((item) => item.view === view));
    const activity = range?.activities.find((item) => item.view === view);
    return !(range && activity && this.has(range.id, activity.id)) && this.isUnlocked(view);
  }

  isUnlocked(view: ViewId): boolean {
    const range = AGE_RANGES.find((entry) => entry.activities.some((item) => item.view === view));
    if (!range) return true;
    const index = range.activities.findIndex((activity) => activity.view === view);
    return this.isAgeUnlocked(range) && range.activities.slice(0, index).every(
      (activity) => this.has(range.id, activity.id),
    );
  }

  complete(rangeId: string, activityId: string): void {
    if (this.has(rangeId, activityId)) return;
    this.completed.add(`${rangeId}/${activityId}`);
    this.save();
  }

  reset(): void {
    this.completed.clear();
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.completed]));
    } catch {
      // Keep the current session usable if saving fails.
    }
  }
}
import { AGE_RANGES, type AgeRange } from './activities.config';
import type { ViewId } from '../views/view';

