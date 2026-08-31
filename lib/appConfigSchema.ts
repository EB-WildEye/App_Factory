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

import type { AppConfig } from '@/types/appConfig';

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

  /** BLOCKED: no enumeration of valid templates exists, so any non-empty string. */
  uiTemplate: z.string().min(1),

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
