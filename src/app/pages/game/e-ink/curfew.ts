import { CURFEW_CONFIG, CurfewConfig, CurfewRule } from './curfew.config';

/** `auto` follows the clock; `off` forces play; anything else is a rule id to force on. */
export type CurfewOverride = 'auto' | 'off' | string;

const MINUTES_PER_DAY = 24 * 60;

/** "HH:MM" to minutes since midnight. "24:00" is the end of the day, not the start. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  const value = Number(hours) * 60 + Number(minutes ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** True when `minute` falls in [from, to), wrapping past midnight when from > to. */
function contains(minute: number, from: number, to: number): boolean {
  if (from === to) {
    return false;
  }
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/**
 * Decides whether the device is inside a curfew window right now.
 *
 * The answer only changes once a minute, so it is cached and recomputed when the
 * wall-clock minute (or the dev override) moves on.
 */
export class Curfew {
  /** Dev panel escape hatch, so a window can be previewed at any hour. */
  override: CurfewOverride = 'auto';

  private cachedMinute = -1;
  private cachedOverride: CurfewOverride | null = null;
  private cachedRule: CurfewRule | null = null;

  constructor(private readonly config: CurfewConfig = CURFEW_CONFIG) {}

  get rules(): readonly CurfewRule[] {
    return this.config.rules;
  }

  /** The rule in force, or null when the device is free to play. */
  active(now: Date = new Date()): CurfewRule | null {
    const minute = now.getHours() * 60 + now.getMinutes();
    if (minute === this.cachedMinute && this.override === this.cachedOverride) {
      return this.cachedRule;
    }

    this.cachedMinute = minute;
    this.cachedOverride = this.override;
    this.cachedRule = this.resolve(minute);
    return this.cachedRule;
  }

  /** Minutes left in the current window, or 0 when nothing is in force. */
  remainingMinutes(now: Date = new Date()): number {
    const rule = this.active(now);
    if (!rule) {
      return 0;
    }

    const minute = now.getHours() * 60 + now.getMinutes();
    const end = toMinutes(rule.to);
    return (end - minute + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY;
  }

  private resolve(minute: number): CurfewRule | null {
    if (this.override === 'off') {
      return null;
    }

    if (this.override !== 'auto') {
      return this.config.rules.find((rule) => rule.id === this.override) ?? null;
    }

    if (!this.config.enabled) {
      return null;
    }

    return (
      this.config.rules.find((rule) =>
        contains(minute, toMinutes(rule.from), toMinutes(rule.to)),
      ) ?? null
    );
  }
}
