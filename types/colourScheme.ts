/**
 * The colour-scheme contract: a closed set of semantic roles, and the requirement
 * that every scheme fills all of them.
 *
 * ADR 0023. The roles are **semantic, not chromatic** — `surfaceBrand`, not
 * `sage800`. A template paints with roles, so a scheme can change every colour
 * without the template knowing anything about it.
 *
 * The set is closed on purpose. A scheme missing a role leaves a template painting
 * with `undefined`, which renders as "inherit" and produces an app that looks broken
 * in a way no test catches. `colourSchemeSchema` in `lib/appConfigSchema.ts` rejects
 * a partial scheme rather than filling it in.
 *
 * **Role names are QUEUED (Q38).** They are a contract — they appear in every scheme,
 * in every template, and in the CSS variables the browser sees.
 */

/**
 * Every role a scheme must fill. Nineteen, derived one-to-one from what Gali's
 * stylesheet actually paints (`docs/gali-ground-truth.md` §11) rather than from a
 * generic design-system checklist.
 */
export const COLOUR_ROLES = [
  // Surfaces, back to front.
  'surfaceCanvas',
  'surfaceRaised',
  'surfaceRail',
  'surfaceSubtle',
  'surfaceBrand',
  'surfaceBrandDeep',
  // Text, by prominence and by what it sits on.
  'textPrimary',
  'textSecondary',
  'textMuted',
  'textOnBrand',
  'textOnBrandMuted',
  'textAccent',
  // Lines.
  'borderSubtle',
  'borderDefault',
  'borderStrong',
  'borderFocus',
  // Interaction.
  'focusRing',
  'controlBrand',
  // The single colour every shadow is tinted with.
  'shadowTint',
] as const;

export type ColourRole = (typeof COLOUR_ROLES)[number];

/** A hex colour, `#rrggbb`, lowercase. Six digits — no shorthand, no alpha. */
export type HexColour = string;

/** A complete scheme: every role, exactly once. */
export type ColourScheme = Readonly<Record<ColourRole, HexColour>>;

/**
 * A scheme the factory ships, identified by a stable id.
 *
 * `custom` is not a preset — it is the marker for a scheme the creator authored
 * role by role, and it carries its own colours in `AppConfig`.
 */
export const PRESET_SCHEME_IDS = [
  'gali-sage',
  'clinical-blue',
  'warm-clay',
  'slate-neutral',
  'quiet-plum',
] as const;

export type PresetSchemeId = (typeof PRESET_SCHEME_IDS)[number];

/** What `AppConfig` carries: a preset by id, or a full custom scheme. */
export type ColourSchemeSelection =
  | { readonly kind: 'preset'; readonly presetId: PresetSchemeId }
  | { readonly kind: 'custom'; readonly colours: ColourScheme };
