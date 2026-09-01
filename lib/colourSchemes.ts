/**
 * The preset colour schemes, and the pairs the contrast guard checks.
 *
 * ADR 0023. Scheme `gali-sage` is **copied from the Gali frontend**, value for value
 * — `Gali-frontend/src/index.css:9-30` and `tailwind.config.js`. Nothing in it is
 * invented. The other four are proposals.
 *
 * Every scheme fills every role in `COLOUR_ROLES`. That is enforced by the type here
 * and by `colourSchemeSchema` at the boundary; `tests/lib/colourSchemes.test.ts`
 * checks it for the presets too, because a preset is data and data drifts.
 */

import type { ColourRole, ColourScheme, PresetSchemeId } from '@/types/colourScheme';
import type { TextSize } from '@/lib/colourContrast';

/**
 * Scheme 1 — Gali's own palette, as shipped.
 *
 * Provenance per value. The sage scale and the bone scale are declared twice in
 * Gali, in `tailwind.config.js` and again as CSS variables in `index.css`; the values
 * agree, and the CSS variables are cited because that is what the browser reads.
 *
 * | role | Gali token | source |
 * | ---- | ---------- | ------ |
 * | `surfaceCanvas` | `--bone-50` | `body { background }` |
 * | `surfaceRaised` | literal `#ffffff` | `.bubble-user`, `.composer-shell`, `.pill-suggest` |
 * | `surfaceRail` | `--sage-25` | `.rail-surface` gradient end |
 * | `surfaceSubtle` | `--sage-50` | `.info-card` gradient start |
 * | `surfaceBrand` | `--sage-800` | `.bubble-bot` start, and `<meta name="theme-color">` |
 * | `surfaceBrandDeep` | `--sage-900` | `.bubble-bot` end, `.identity-plate` start |
 * | `textPrimary` | `--ink` | `body { color }` |
 * | `textSecondary` | `--ink-soft` | declared token |
 * | `textMuted` | `--ink-mute` | declared token |
 * | `textOnBrand` | literal `#ffffff` | `.bubble-bot { color }` |
 * | `textOnBrandMuted` | `--sage-100` | `text-sage-100` on the identity plate |
 * | `textAccent` | `--sage-600` | `.label-eyebrow`, `.ornament-rule span` |
 * | `borderSubtle` | `--sage-100` | `.bubble-user`, `.composer-shell` border |
 * | `borderDefault` | `--sage-200` | `.info-card` border, scrollbar thumb |
 * | `borderStrong` | `--sage-300` | `.ornament-rule`, `.pill-suggest:hover` border |
 * | `borderFocus` | `--sage-400` | `.composer-shell:focus-within` border |
 * | `focusRing` | `--sage-600` | `:focus-visible { outline }` |
 * | `controlBrand` | `--sage-700` | `.send-jewel` gradient start |
 * | `shadowTint` | `--sage-950` | **every** shadow in the file is `rgba(26,61,50,α)` |
 *
 * That last row is the one worth noticing: Gali tints every shadow with one colour at
 * varying alpha. A scheme that left shadows neutral grey would look wrong on a
 * coloured surface for a reason nobody could name.
 */
export const GALI_SAGE_SCHEME: ColourScheme = {
  surfaceCanvas: '#faf8f5',
  surfaceRaised: '#ffffff',
  surfaceRail: '#f4f7f5',
  surfaceSubtle: '#eef5f1',
  surfaceBrand: '#2d5a4c',
  surfaceBrandDeep: '#244c3f',
  textPrimary: '#1f2a26',
  textSecondary: '#4a5a54',
  textMuted: '#7d8a83',
  textOnBrand: '#ffffff',
  textOnBrandMuted: '#e4efe8',
  textAccent: '#4a8b7a',
  borderSubtle: '#e4efe8',
  borderDefault: '#d5e5db',
  borderStrong: '#b9d6cb',
  borderFocus: '#94c2b3',
  focusRing: '#4a8b7a',
  controlBrand: '#3a6b5c',
  shadowTint: '#1a3d32',
};

/** Scheme 2 — institutional blue. Proposed, not derived from anything. */
export const CLINICAL_BLUE_SCHEME: ColourScheme = {
  surfaceCanvas: '#f7f9fb',
  surfaceRaised: '#ffffff',
  surfaceRail: '#f2f6fa',
  surfaceSubtle: '#e9f1f8',
  surfaceBrand: '#1d4e6f',
  surfaceBrandDeep: '#16405c',
  textPrimary: '#16232b',
  textSecondary: '#43555f',
  textMuted: '#6d7f8a',
  textOnBrand: '#ffffff',
  textOnBrandMuted: '#dceaf4',
  textAccent: '#1a5f80',
  borderSubtle: '#e2ecf3',
  borderDefault: '#cfe0ec',
  borderStrong: '#b3cede',
  borderFocus: '#4a86ad',
  focusRing: '#1a5f80',
  controlBrand: '#19597a',
  shadowTint: '#0f2f43',
};

/** Scheme 3 — warm clay. Proposed. The least clinical of the five. */
export const WARM_CLAY_SCHEME: ColourScheme = {
  surfaceCanvas: '#fbf7f4',
  surfaceRaised: '#ffffff',
  surfaceRail: '#f8f3ee',
  surfaceSubtle: '#f3e9e1',
  surfaceBrand: '#7a4a35',
  surfaceBrandDeep: '#633a29',
  textPrimary: '#2a211c',
  textSecondary: '#5a4a41',
  textMuted: '#8b7a70',
  textOnBrand: '#ffffff',
  textOnBrandMuted: '#f0e2d9',
  textAccent: '#8a4a2e',
  borderSubtle: '#f0e4da',
  borderDefault: '#e3d0c2',
  borderStrong: '#d1b7a5',
  borderFocus: '#a8785c',
  focusRing: '#8a4a2e',
  controlBrand: '#6f4230',
  shadowTint: '#3d2317',
};

/** Scheme 4 — slate. Proposed. Maximum neutrality, highest text contrast. */
export const SLATE_NEUTRAL_SCHEME: ColourScheme = {
  surfaceCanvas: '#f8f9fa',
  surfaceRaised: '#ffffff',
  surfaceRail: '#f3f5f7',
  surfaceSubtle: '#eceff2',
  surfaceBrand: '#37474f',
  surfaceBrandDeep: '#263238',
  textPrimary: '#1c2226',
  textSecondary: '#48555c',
  textMuted: '#6f7c83',
  textOnBrand: '#ffffff',
  textOnBrandMuted: '#e3e8eb',
  textAccent: '#3d5661',
  borderSubtle: '#e6eaed',
  borderDefault: '#d4dbe0',
  borderStrong: '#bcc6cd',
  borderFocus: '#748690',
  focusRing: '#3d5661',
  controlBrand: '#32424a',
  shadowTint: '#182024',
};

/** Scheme 5 — quiet plum. Proposed. Distinct from the other four without shouting. */
export const QUIET_PLUM_SCHEME: ColourScheme = {
  surfaceCanvas: '#faf7fa',
  surfaceRaised: '#ffffff',
  surfaceRail: '#f6f1f6',
  surfaceSubtle: '#f0e7f0',
  surfaceBrand: '#5c3a5c',
  surfaceBrandDeep: '#4a2e4a',
  textPrimary: '#241d24',
  textSecondary: '#4f434f',
  textMuted: '#7d707d',
  textOnBrand: '#ffffff',
  textOnBrandMuted: '#ebdeeb',
  textAccent: '#6b3f6b',
  borderSubtle: '#ece0ec',
  borderDefault: '#dcc9dc',
  borderStrong: '#c6abc6',
  borderFocus: '#8f6a8f',
  focusRing: '#6b3f6b',
  controlBrand: '#573557',
  shadowTint: '#2b1b2b',
};

export const PRESET_SCHEMES: Readonly<Record<PresetSchemeId, ColourScheme>> = {
  'gali-sage': GALI_SAGE_SCHEME,
  'clinical-blue': CLINICAL_BLUE_SCHEME,
  'warm-clay': WARM_CLAY_SCHEME,
  'slate-neutral': SLATE_NEUTRAL_SCHEME,
  'quiet-plum': QUIET_PLUM_SCHEME,
};

/**
 * A foreground/background pair the contrast guard checks, and at which threshold.
 *
 * The list is explicit rather than every-role-against-every-role, because most
 * combinations never meet on screen and a guard that flags impossible pairs is a
 * guard people switch off. **QUEUED (Q39): the pair list and each pair's size
 * classification.** Which text is "large" is a typography fact about the template,
 * and the template does not exist yet.
 */
export interface ContrastPair {
  readonly foreground: ColourRole;
  readonly background: ColourRole;
  readonly size: TextSize;
  readonly why: string;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Body text, on every surface it can land on.
  { foreground: 'textPrimary', background: 'surfaceCanvas', size: 'normal', why: 'body text on the canvas' },
  { foreground: 'textPrimary', background: 'surfaceRaised', size: 'normal', why: 'body text in a bubble or the composer' },
  { foreground: 'textPrimary', background: 'surfaceRail', size: 'normal', why: 'body text in the rail' },
  { foreground: 'textPrimary', background: 'surfaceSubtle', size: 'normal', why: 'body text in an info card' },
  { foreground: 'textSecondary', background: 'surfaceCanvas', size: 'normal', why: 'secondary text on the canvas' },
  { foreground: 'textSecondary', background: 'surfaceRaised', size: 'normal', why: 'secondary text in a bubble' },
  // Text on the brand surfaces — the assistant's own answers live here.
  { foreground: 'textOnBrand', background: 'surfaceBrand', size: 'normal', why: "the assistant's answer text" },
  { foreground: 'textOnBrand', background: 'surfaceBrandDeep', size: 'normal', why: 'the same text at the gradient end' },
  { foreground: 'textOnBrandMuted', background: 'surfaceBrand', size: 'normal', why: 'supporting text on the identity plate' },
  { foreground: 'textOnBrandMuted', background: 'surfaceBrandDeep', size: 'normal', why: 'the same at the gradient end' },
  // The accent, which is where Gali's own palette fails.
  { foreground: 'textAccent', background: 'surfaceCanvas', size: 'normal', why: 'eyebrow labels and small actions' },
  { foreground: 'textAccent', background: 'surfaceRaised', size: 'normal', why: 'the copy action inside a bubble' },
  { foreground: 'textAccent', background: 'surfaceSubtle', size: 'normal', why: 'labels inside an info card' },
  // 3:1 — large text, and non-text UI under SC 1.4.11.
  { foreground: 'textMuted', background: 'surfaceCanvas', size: 'large', why: 'timestamps and other de-emphasised text' },
  { foreground: 'textMuted', background: 'surfaceRaised', size: 'large', why: 'the same inside a bubble' },
  { foreground: 'focusRing', background: 'surfaceCanvas', size: 'large', why: 'the keyboard focus indicator must be visible' },
  { foreground: 'focusRing', background: 'surfaceRaised', size: 'large', why: 'the same on a raised surface' },
  { foreground: 'borderFocus', background: 'surfaceRaised', size: 'large', why: 'the focused input border is a UI component' },
  { foreground: 'controlBrand', background: 'surfaceCanvas', size: 'large', why: 'the send button against the canvas' },
];
