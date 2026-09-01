/**
 * WCAG 2.1 contrast arithmetic.
 *
 * The anchors are the specification's own well-known values, not numbers this
 * implementation produced: black on white is exactly 21:1, anything on itself is
 * exactly 1:1, and `#767676` on white is the canonical 4.5:1 boundary grey — it is
 * the darkest grey that passes AA for normal text, which is why it appears in every
 * accessibility guide. If a refactor breaks the formula, these move.
 */

import { describe, expect, test } from 'bun:test';

import {
  CONTRAST_MIN_LARGE_TEXT,
  CONTRAST_MIN_NORMAL_TEXT,
  contrastRatio,
  contrastRatioRounded,
  isHexColour,
  meetsContrastAA,
  relativeLuminance,
} from '@/lib/colourContrast';

describe('isHexColour', () => {
  test('accepts lowercase six-digit hex', () => {
    expect(isHexColour('#2d5a4c')).toBe(true);
    expect(isHexColour('#ffffff')).toBe(true);
    expect(isHexColour('#000000')).toBe(true);
  });

  test('rejects shorthand, alpha, uppercase and junk', () => {
    // Shorthand and alpha are rejected because a scheme is written into CSS variables
    // that SVG and inline styles also read, where they do not behave identically.
    expect(isHexColour('#abc')).toBe(false);
    expect(isHexColour('#2d5a4cff')).toBe(false);
    expect(isHexColour('#2D5A4C')).toBe(false);
    expect(isHexColour('2d5a4c')).toBe(false);
    expect(isHexColour('rgb(45,90,76)')).toBe(false);
    expect(isHexColour('')).toBe(false);
  });
});

describe('relativeLuminance', () => {
  test('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  test('throws on a colour it cannot parse, rather than returning a number', () => {
    expect(() => relativeLuminance('#abc')).toThrow(RangeError);
  });
});

describe('contrastRatio', () => {
  test('black on white is 21:1', () => {
    expect(contrastRatioRounded('#000000', '#ffffff')).toBe(21);
  });

  test('a colour against itself is 1:1', () => {
    expect(contrastRatioRounded('#2d5a4c', '#2d5a4c')).toBe(1);
    expect(contrastRatioRounded('#ffffff', '#ffffff')).toBe(1);
  });

  test('is symmetric — argument order does not matter', () => {
    expect(contrastRatio('#2d5a4c', '#ffffff')).toBe(contrastRatio('#ffffff', '#2d5a4c'));
  });

  test('matches the specification at the two canonical boundary greys', () => {
    // #767676 is the darkest grey that clears 4.5:1 on white; #949494 the darkest
    // that clears 3:1.
    expect(contrastRatioRounded('#767676', '#ffffff')).toBe(4.54);
    expect(contrastRatioRounded('#949494', '#ffffff')).toBe(3.03);
  });
});

describe('meetsContrastAA', () => {
  test('the two thresholds are 4.5 and 3', () => {
    expect(CONTRAST_MIN_NORMAL_TEXT).toBe(4.5);
    expect(CONTRAST_MIN_LARGE_TEXT).toBe(3);
  });

  test('#767676 on white passes normal text, #949494 does not', () => {
    expect(meetsContrastAA('#767676', '#ffffff', 'normal')).toBe(true);
    expect(meetsContrastAA('#949494', '#ffffff', 'normal')).toBe(false);
  });

  test('#949494 on white passes large text', () => {
    expect(meetsContrastAA('#949494', '#ffffff', 'large')).toBe(true);
  });

  test('compares the unrounded ratio, so a 4.49 does not round its way to a pass', () => {
    // #777777 on white is just under 4.5. Rounding first would report 4.5 and pass it.
    const ratio = contrastRatio('#777777', '#ffffff');
    expect(ratio < CONTRAST_MIN_NORMAL_TEXT).toBe(true);
    expect(meetsContrastAA('#777777', '#ffffff', 'normal')).toBe(false);
  });
});
