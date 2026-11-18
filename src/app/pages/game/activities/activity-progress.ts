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

  complete(rangeId: string, activityId: string): void {
    if (this.has(rangeId, activityId)) return;
    this.completed.add(`${rangeId}/${activityId}`);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.completed]));
    } catch {
      // Keep the current session usable if saving fails.
    }
  }
}
