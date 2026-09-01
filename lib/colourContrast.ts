/**
 * WCAG 2.1 contrast ratios. Pure arithmetic, no dependencies, no DOM.
 *
 * ADR 0023 makes this a **save-time gate, not a render-time hope**: a creator who
 * picks an unreadable pair is told at the moment they pick it. In a medical setting
 * that is an accessibility requirement, not a preference — a patient who cannot read
 * the answer has not been answered.
 *
 * The formulas are the specification's, not an approximation:
 *   relative luminance  WCAG 2.1, Understanding SC 1.4.3
 *   contrast ratio      (L_lighter + 0.05) / (L_darker + 0.05)
 */

/** WCAG 2.1 AA, normal text. */
export const CONTRAST_MIN_NORMAL_TEXT = 4.5;

/**
 * WCAG 2.1 AA, large text — 18pt, or 14pt bold. Also the threshold for UI
 * components and graphical objects under SC 1.4.11.
 */
export const CONTRAST_MIN_LARGE_TEXT = 3;

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

/** True for `#rrggbb`, lowercase, six digits. Shorthand and alpha are rejected. */
export function isHexColour(value: string): boolean {
  return HEX_COLOUR.test(value);
}

interface Channels {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function toChannels(hex: string): Channels {
  if (!isHexColour(hex)) {
    throw new RangeError(`Not a #rrggbb colour: ${hex}`);
  }
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** The sRGB→linear step of the luminance formula, applied per channel. */
function linearise(channel8Bit: number): number {
  const channel = channel8Bit / 255;
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Relative luminance, 0 for black through 1 for white. */
export function relativeLuminance(hex: string): number {
  const { red, green, blue } = toChannels(hex);
  return (
    0.2126 * linearise(red) + 0.7152 * linearise(green) + 0.0722 * linearise(blue)
  );
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black on white).
 * Symmetric: the order of the arguments does not matter.
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded to two decimals, for messages and reports. Never for comparisons. */
export function contrastRatioRounded(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}

export type TextSize = 'normal' | 'large';

/** Does this pair clear WCAG 2.1 AA for text of this size? */
export function meetsContrastAA(
  foreground: string,
  background: string,
  size: TextSize,
): boolean {
  const minimum =
    size === 'large' ? CONTRAST_MIN_LARGE_TEXT : CONTRAST_MIN_NORMAL_TEXT;
  // Compared against the unrounded ratio: 4.499 must fail, and rounding it first
  // would pass it.
  return contrastRatio(foreground, background) >= minimum;
}
