/**
 * Applies the contrast pair list to a scheme. One job: turn a scheme into the list
 * of pairs that fail WCAG 2.1 AA.
 *
 * Separate from `lib/colourContrast.ts`, which knows the arithmetic and nothing about
 * roles, and from `lib/colourSchemes.ts`, which holds the data. This module is the
 * only place the two meet, and it is what the zod refinement calls.
 */

import { contrastRatioRounded, isHexColour, meetsContrastAA } from '@/lib/colourContrast';
import { CONTRAST_PAIRS } from '@/lib/colourSchemes';
import type { TextSize } from '@/lib/colourContrast';
import type { ColourRole, ColourScheme } from '@/types/colourScheme';

export interface ContrastFailure {
  readonly foreground: ColourRole;
  readonly background: ColourRole;
  readonly foregroundColour: string;
  readonly backgroundColour: string;
  readonly size: TextSize;
  readonly ratio: number;
  readonly required: number;
  readonly why: string;
}

const REQUIRED_BY_SIZE: Readonly<Record<TextSize, number>> = {
  normal: 4.5,
  large: 3,
};

/**
 * Every checked pair in `scheme` that fails AA. Empty means the scheme passes.
 *
 * **Total: never throws, for any input.** Two reasons, and the second was found by a
 * test rather than reasoned about in advance:
 *
 * - The create form has to show every failure at once. A creator who fixes one colour
 *   and is then told about the next is being led through a maze.
 * - This runs inside a zod refinement, and a refinement that throws turns
 *   `safeParse` into something that throws — which defeats the point of `safeParse`.
 *   A malformed colour used to escape as a `RangeError` from the luminance
 *   arithmetic instead of arriving as a validation issue.
 *
 * So a pair whose colours are not parseable is **skipped**, not reported: the
 * per-field hex check has already rejected that value, and reporting it twice under
 * two different messages helps nobody. The arithmetic in `lib/colourContrast.ts` still
 * throws on garbage, which is correct for a pure function — being total is this
 * aggregator's job, not the formula's.
 */
export function findContrastFailures(scheme: ColourScheme): readonly ContrastFailure[] {
  const failures: ContrastFailure[] = [];

  for (const pair of CONTRAST_PAIRS) {
    const foregroundColour = scheme[pair.foreground];
    const backgroundColour = scheme[pair.background];
    if (!isHexColour(foregroundColour) || !isHexColour(backgroundColour)) {
      continue;
    }
    if (meetsContrastAA(foregroundColour, backgroundColour, pair.size)) {
      continue;
    }
    failures.push({
      foreground: pair.foreground,
      background: pair.background,
      foregroundColour,
      backgroundColour,
      size: pair.size,
      ratio: contrastRatioRounded(foregroundColour, backgroundColour),
      required: REQUIRED_BY_SIZE[pair.size],
      why: pair.why,
    });
  }

  return failures;
}

/** One line per failure, for an error message. */
export function describeContrastFailure(failure: ContrastFailure): string {
  return (
    `${failure.foreground} (${failure.foregroundColour}) on ` +
    `${failure.background} (${failure.backgroundColour}) is ${failure.ratio}:1, ` +
    `below the ${failure.required}:1 required for ${failure.size} text — ${failure.why}`
  );
}
