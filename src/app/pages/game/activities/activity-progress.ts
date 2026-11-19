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

  isUnlocked(view: ViewId): boolean {
    const sequence = AGE_RANGES.flatMap(range =>
      range.activities.map(activity => ({ rangeId: range.id, activity })),
    );
    const index = sequence.findIndex(entry => entry.activity.view === view);
    return index <= 0 || sequence.slice(0, index).every(entry =>
      this.has(entry.rangeId, entry.activity.id),
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
import { AGE_RANGES } from './activities.config';
import type { ViewId } from '../views/view';

