import type { ViewId } from '../views/view';

export interface Activity {
  id: string;
  label: string;
  view: ViewId;
  icon: string;
  color: string;
}

export interface AgeRange {
  id: string;
  minAgeMonths: number;
  maxAgeMonths: number;
  label: string;
  activities: readonly Activity[];
}

export interface ActivityTitleConfig {
  visible: boolean;
  color: string;
  /** Font size as a percentage of the screen height. */
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  baseline: CanvasTextBaseline;
  /** Side padding and offsets are percentages of the screen height. */
  sidePadding: number;
  offsetX: number;
  y: number;
}

export const ACTIVITIES_CONFIG = {
  ageMonths: 0,
  title: {
    visible: true,
    color: '#f4f3eb',
    fontSize: 7,
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    fontWeight: 700,
    fontStyle: 'normal',
    align: 'left',
    baseline: 'middle',
    sidePadding: 7,
    offsetX: 0,
    y: 10.5,
  } satisfies ActivityTitleConfig,
  /** Dimensions are percentages of the screen height, except iconScale (0–1). */
  layout: {
    /** Maximum side length of a square activity button. */
    tileSize: 46,
    /** Space between activity buttons. */
    gap: 5,
    /** Minimum padding on each side of the grid. */
    sidePadding: 7,
    /** Distance from the top of the screen to the grid. */
    topPadding: 5,
    /** Share of the button occupied by its icon. Smaller values add padding. */
    iconScale: 1,
    borderWidth: 0.35,
  },
};

export const AGE_RANGES: readonly AgeRange[] = [
  {
    id: 'age-0',
    minAgeMonths: 0,
    maxAgeMonths: 12,
    label: '0',
    activities: [
      {
        id: 'genesis',
        label: 'Genesis',
        view: 'chapter-genesis',
        icon: 'assets/activities/genesis/icon.png',
        color: '#f6a45d',
      },
    ],
  },
  {
    // Keep the original storage key for existing activity completions.
    id: 'age-0-1',
    minAgeMonths: 12,
    maxAgeMonths: 24,
    label: '1',
    activities: [
      {
        id: 'tidy-bed',
        label: 'Tidy bed',
        view: 'chapter-tidy-bed',
        icon: 'assets/activities/tidy-bed/icon.png',
        color: '#81b5e8',
      },
      {
        id: 'mouth-clean',
        label: 'Mouth clean',
        view: 'chapter-mouth-clean',
        icon: 'assets/activities/mouth-clean/icon.png',
        color: '#8ed3ac',
      },
    ],
  },
];
