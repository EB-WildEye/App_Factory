/**
 * The preset schemes.
 *
 * Two jobs. First, completeness: every preset fills every role, because a preset is
 * data and data drifts. Second — and this is the one worth reading — a
 * **characterisation test** of Gali's own palette against WCAG AA.
 *
 * `gali-sage` is copied from the production frontend value for value, and it **fails
 * AA in two places**. The test asserts the failures rather than ignoring them, so the
 * defect is recorded in executable form and cannot be quietly forgotten. When the
 * palette is fixed, this test fails and forces someone to update it — which is the
 * point.
 */

import { describe, expect, test } from 'bun:test';

import { isHexColour } from '@/lib/colourContrast';
import { CONTRAST_PAIRS, GALI_SAGE_SCHEME, PRESET_SCHEMES } from '@/lib/colourSchemes';
import { findContrastFailures } from '@/lib/colourSchemeValidation';
import { COLOUR_ROLES, PRESET_SCHEME_IDS } from '@/types/colourScheme';

describe('every preset scheme is complete', () => {
  test('the registry has an entry for every declared preset id', () => {
    expect(Object.keys(PRESET_SCHEMES).sort()).toEqual([...PRESET_SCHEME_IDS].sort());
  });

  for (const presetId of PRESET_SCHEME_IDS) {
    test(`${presetId} fills exactly the 19 roles, all as #rrggbb`, () => {
      const scheme = PRESET_SCHEMES[presetId];
      expect(Object.keys(scheme).sort()).toEqual([...COLOUR_ROLES].sort());
      expect(COLOUR_ROLES).toHaveLength(19);
      for (const role of COLOUR_ROLES) {
        expect(isHexColour(scheme[role])).toBe(true);
      }
    });
  }
});

describe('the contrast pair list', () => {
  test('every pair names roles that exist', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(COLOUR_ROLES).toContain(pair.foreground);
      expect(COLOUR_ROLES).toContain(pair.background);
    }
  });

  test('every pair explains itself, so a failure message can say why it matters', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.why.length > 0).toBe(true);
    }
  });
});

describe('the four proposed schemes clear WCAG 2.1 AA everywhere', () => {
  for (const presetId of PRESET_SCHEME_IDS) {
    if (presetId === 'gali-sage') {
      continue;
    }
    test(`${presetId} has no contrast failures`, () => {
      expect(findContrastFailures(PRESET_SCHEMES[presetId])).toEqual([]);
    });
  }
});

describe("gali-sage — Gali's real palette, and its two AA failures", () => {
  const failures = findContrastFailures(GALI_SAGE_SCHEME);

  test('the values are Gali\'s, unaltered', () => {
    // Spot-check the three that carry the most meaning: the brand surface is also
    // Gali's <meta name="theme-color">, the canvas is --bone-50, and every shadow in
    // the stylesheet is tinted with --sage-950.
    expect(GALI_SAGE_SCHEME.surfaceBrand).toBe('#2d5a4c');
    expect(GALI_SAGE_SCHEME.surfaceCanvas).toBe('#faf8f5');
    expect(GALI_SAGE_SCHEME.shadowTint).toBe('#1a3d32');
  });

  test('it fails exactly four checked pairs, and they are the accent and the focus border', () => {
    // textAccent is --sage-600 and Gali uses it only at 10-11px, so 4.5:1 applies and
    // it misses on all three light surfaces. borderFocus is --sage-400 on white, which
    // is a focus indicator under SC 1.4.11 and needs 3:1.
    const summary = failures
      .map((f) => `${f.foreground} on ${f.background}`)
      .sort();
    expect(summary).toEqual([
      'borderFocus on surfaceRaised',
      'textAccent on surfaceCanvas',
      'textAccent on surfaceRaised',
      'textAccent on surfaceSubtle',
    ]);
  });

  test('the failures are near-misses on the accent and a clear miss on the border', () => {
    const byPair = new Map(
      failures.map((f) => [`${f.foreground}/${f.background}`, f.ratio]),
    );
    // Near-misses: raising sage-600 to roughly 4.5 would fix all three at once.
    expect(byPair.get('textAccent/surfaceRaised')).toBe(3.99);
    expect(byPair.get('textAccent/surfaceCanvas')).toBe(3.76);
    expect(byPair.get('textAccent/surfaceSubtle')).toBe(3.6);
    // Not a near-miss. A 1.98:1 focus border is close to invisible.
    expect(byPair.get('borderFocus/surfaceRaised')).toBe(1.98);
  });

  test('the text that matters most is comfortably clear', () => {
    // The assistant's own answers are textOnBrand on surfaceBrand. Whatever else is
    // wrong with the palette, the thing a patient reads is fine.
    const answerText = failures.find(
      (f) => f.foreground === 'textOnBrand' && f.background === 'surfaceBrand',
    );
    expect(answerText).toBe(undefined);
  });
});
