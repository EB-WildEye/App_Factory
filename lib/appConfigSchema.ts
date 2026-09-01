/**
 * The zod schema for `AppConfig`. One schema, used by the create form and by the
 * route handlers under `app/api` — ADR 0005 makes validation a handler duty, and two
 * schemas for one contract is how a handler starts accepting what the form rejects.
 *
 * `parseAppConfig` is annotated as returning `AppConfig`, which is what keeps this
 * schema and `types/appConfig.ts` from drifting: if the schema stops producing that
 * shape, this module stops compiling.
 *
 * Strict objects throughout. An unknown field is a rejection, not a silently stripped
 * key: a typo'd field name in a config that provisions AWS resources should fail
 * loudly at the boundary.
 */

import { z } from 'zod';

import { isHexColour } from '@/lib/colourContrast';
import { describeContrastFailure, findContrastFailures } from '@/lib/colourSchemeValidation';
import { COLOUR_ROLES, PRESET_SCHEME_IDS } from '@/types/colourScheme';
import { UI_TEMPLATE_IDS } from '@/types/appConfig';
import type { ColourRole, ColourScheme } from '@/types/colourScheme';
import type { AppConfig } from '@/types/appConfig';

/**
 * A hex colour, lowercase `#rrggbb`. Shorthand and alpha are rejected: a scheme is
 * written into CSS variables that SVG and inline styles also read, and `#abc` or
 * `#rrggbbaa` behave differently across those contexts.
 */
const hexColourSchema = z.string().refine(isHexColour, {
  message: 'Must be a lowercase six-digit hex colour, for example #2d5a4c',
});

/**
 * A complete colour scheme: **every** role in `COLOUR_ROLES`, none missing, none extra.
 *
 * Built from the role list rather than written out, so adding a role cannot leave the
 * schema behind. `z.strictObject` is what rejects the extra key; the generated shape is
 * what rejects the missing one.
 */
export const colourSchemeSchema = z.strictObject(
  Object.fromEntries(COLOUR_ROLES.map((role) => [role, hexColourSchema])) as Record<
    ColourRole,
    typeof hexColourSchema
  >,
);

/**
 * A custom scheme, additionally required to clear WCAG 2.1 AA on every checked pair.
 *
 * ADR 0023: this is an accessibility requirement, not a preference, and it is checked
 * **at save time** — a creator who picks an unreadable pair is told while they are
 * still looking at it. Every failing pair is reported, not just the first, because
 * fixing one colour at a time through a sequence of errors is a maze.
 */
const contrastCheckedSchemeSchema = colourSchemeSchema.superRefine((scheme, ctx) => {
  for (const failure of findContrastFailures(scheme as ColourScheme)) {
    ctx.addIssue({
      code: 'custom',
      path: [failure.foreground],
      message: describeContrastFailure(failure),
    });
  }
});

/**
 * Preset by id, or a full custom scheme. Discriminated on `kind` so an error points at
 * the branch the creator actually chose rather than reporting both as wrong.
 */
export const colourSchemeSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preset'),
    presetId: z.enum(PRESET_SCHEME_IDS),
  }),
  z.strictObject({
    kind: z.literal('custom'),
    colours: contrastCheckedSchemeSchema,
  }),
]);

/**
 * The five prompt parts. Only membership and type are checked here.
 *
 * No minimum length on the four strings or on the rule list: nothing in the accepted
 * ADRs says a part may not be empty, and the length constraint that does exist is on
 * the *composed* prompt, enforced by `composeSystemPrompt` (ADR 0016). Validating the
 * cap here would put the same rule in two places with two error messages.
 */
export const appConfigSystemPromptSchema = z.strictObject({
  identity: z.string(),
  language: z.string(),
  voice: z.string(),
  rules: z.array(z.string()),
  formatAndFlags: z.string(),
});

export const appConfigSchema = z.strictObject({
  /**
   * Non-empty is the only rule stated anywhere. The real rule is S3 bucket naming
   * law, because `appName` becomes the bucket name verbatim — BLOCKED, see the draft
   * ADR on bucket naming and `QUESTIONS.md`.
   */
  appName: z.string().min(1),

  /**
   * ADR 0023: a closed enum of built templates. An unknown value is a validation
   * error at the boundary rather than a render-time fallback, because the person a
   * silent fallback affects is a patient looking at the wrong app.
   */
  uiTemplate: z.enum(UI_TEMPLATE_IDS),

  /** ADR 0023. Completeness and contrast are both enforced here. */
  colourScheme: colourSchemeSelectionSchema,

  /**
   * ADR 0009 as amended. **No default in the schema.** The default belongs to the
   * create form, which knows it is creating a new app; a schema default would silently
   * turn an omitted field into "on" for a config assembled anywhere else - including
   * for Gali, where it must be off.
   */
  renderPrecedenceText: z.boolean(),

  systemPrompt: appConfigSystemPromptSchema,

  /**
   * ADR 0028. Validated as an email address, which is the one thing about it that
   * is not a decision — an unsendable recipient means a day of conversations is
   * never delivered and, because deletion follows a confirmed send, never deleted
   * either.
   *
   * BLOCKED: whether the address must be inside a permitted hospital domain. That
   * is a data-governance rule, not a format rule, and nobody has stated it — see
   * `QUESTIONS.md` Q30.
   */
  digestRecipientEmail: z.email(),

  /**
   * BLOCKED BY ADR-0010 / ADR-0011. `z.never()` accepts only the empty array, which
   * is what "the element shape is undecided" actually means. A `z.unknown()` here
   * would accept anything and quietly become the contract.
   */
  dataFiles: z.array(z.never()),
  disclaimers: z.array(z.never()),
});

/**
 * Validate unknown input as an `AppConfig`.
 *
 * @throws {z.ZodError} with the field path for every violation.
 */
export function parseAppConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}
