import { AGE_RANGES, AgeRange } from './activities.config';

/** Upper bounds are exclusive, so twelve months belongs to the next interval. */
export function ageRange(ageMonths: number): AgeRange | undefined {
  return AGE_RANGES.find(
    (range) => ageMonths >= range.minAgeMonths && ageMonths < range.maxAgeMonths,
  );
}
