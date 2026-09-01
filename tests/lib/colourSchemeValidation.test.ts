/**
 * `findContrastFailures` must be **total** — it runs inside a zod refinement, and a
 * refinement that throws turns `safeParse` into something that throws.
 *
 * The last test here is a regression: a malformed colour used to escape as a
 * `RangeError` from the luminance arithmetic instead of arriving as a validation issue.
 */

import { describe, expect, test } from 'bun:test';

import { findContrastFailures } from '@/lib/colourSchemeValidation';
import { CLINICAL_BLUE_SCHEME, GALI_SAGE_SCHEME } from '@/lib/colourSchemes';
import type { ColourScheme } from '@/types/colourScheme';

describe('findContrastFailures', () => {
  test('a passing scheme yields no failures', () => {
    expect(findContrastFailures(CLINICAL_BLUE_SCHEME)).toEqual([]);
  });

  test('a failure carries both colours, the ratio, the threshold and the reason', () => {
    const failures = findContrastFailures(GALI_SAGE_SCHEME);
    const accent = failures.find(
      (f) => f.foreground === 'textAccent' && f.background === 'surfaceRaised',
    );
    expect(accent?.foregroundColour).toBe('#4a8b7a');
    expect(accent?.backgroundColour).toBe('#ffffff');
    expect(accent?.ratio).toBe(3.99);
    expect(accent?.required).toBe(4.5);
    expect(accent?.size).toBe('normal');
    expect((accent?.why ?? '').length > 0).toBe(true);
  });

  test('does not throw on a malformed colour — it skips that pair', () => {
    // Regression. The per-field hex check reports the bad value; reporting it again
    // here under a contrast message would help nobody, and throwing would break
    // safeParse.
    const broken = { ...CLINICAL_BLUE_SCHEME, textPrimary: '#ABC' } as ColourScheme;
    expect(() => findContrastFailures(broken)).not.toThrow();
    for (const failure of findContrastFailures(broken)) {
      expect(failure.foreground).not.toBe('textPrimary');
    }
  });

  test('does not throw on an empty string either', () => {
    const broken = { ...CLINICAL_BLUE_SCHEME, focusRing: '' } as ColourScheme;
    expect(() => findContrastFailures(broken)).not.toThrow();
  });
});
