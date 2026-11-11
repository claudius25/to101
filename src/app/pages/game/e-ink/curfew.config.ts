/**
 * Curfew windows: stretches of the day when the device refuses to play.
 *
 * While a rule is in force the e-ink strip shows its message beside a character, and
 * the black glass screen goes dark and stops accepting input — keys and the lever still
 * animate, they just do not reach the game.
 *
 * Adding a window is a matter of adding a rule below: `from`/`to` are local wall-clock
 * times, and a rule whose `to` is earlier than its `from` wraps over midnight. Rows are
 * free-form, so a message can be two lines or five; the card shrinks the type to fit.
 * Inside a row, `**bold**` and `__underline__` work as you would expect.
 */

export interface CurfewRule {
  /** Stable id, shown in the dev panel and used to force a rule on. */
  id: string;
  /** Inclusive start, as local "HH:MM". */
  from: string;
  /** Exclusive end, as local "HH:MM". "24:00" means midnight at the end of the day. */
  to: string;
  /** One entry per line of the message. Any number of rows. */
  rows: string[];
  /** Character art for this rule. Falls back to `CurfewConfig.character`. */
  character?: string;
}

export interface CurfewLayout {
  /** Margin inside the e-ink card, in units (a unit is 1% of the card height). */
  padding: number;
  /** Space between the character and the text block, in units. */
  gap: number;
  /** Share of the card width handed to the character, 0-1. */
  characterWidth: number;
  /** Baseline-to-baseline distance, as a multiple of the font size. */
  lineHeight: number;
  /** Type is fitted between these sizes, in units. */
  maxFontUnits: number;
  minFontUnits: number;
}

export interface CurfewConfig {
  /** Master switch: false keeps the device playable around the clock. */
  enabled: boolean;
  /** Character art used by any rule that does not name its own. */
  character: string;
  layout: CurfewLayout;
  rules: CurfewRule[];
}

export const CURFEW_CONFIG: CurfewConfig = {
  enabled: true,
  character: 'assets/e-ink/officer.png',
  layout: {
    padding: 7,
    gap: 4,
    characterWidth: 0.24,
    lineHeight: 1.26,
    maxFontUnits: 26,
    minFontUnits: 8,
  },
  rules: [
    {
      id: 'bedtime',
      from: '21:00',
      to: '24:00',
      rows: [
        'After **9:00 PM**, no more playing!',
        'Sleep is not wasted time. While you sleep, your brain',
        'strengthens memories, your body repairs tissues, and',
        'your immune system gets ready for tomorrow.',
        'Brush your teeth, get to bed,',
        '**RECOVERY IS PART OF THE MISSION!**',
      ],
    },
    {
      id: 'night',
      from: '00:00',
      to: '06:00',
      rows: [
        'It is **past midnight**.',
        'This device wakes up at **6:00 AM**,',
        'and you should still be asleep by then!',
      ],
    },
  ],
};
