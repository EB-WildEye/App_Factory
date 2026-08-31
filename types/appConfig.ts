/**
 * `AppConfig` — the JSON the create form produces and the provisioning backend
 * consumes. It is the contract this milestone exists to define.
 *
 * Naming follows ADR 0008: `camelCase` here and everywhere above the BFF boundary,
 * `snake_case` on the wire. The single translation lives in
 * `app/api/appConfigWire.ts` and nowhere else.
 *
 * Two fields are shaped by ADRs that are still open. They are typed as narrowly as
 * the accepted ADRs allow rather than given a plausible shape, so that writing code
 * against an undecided contract is a compile error instead of a habit. See
 * `QUESTIONS.md`.
 */

/**
 * The five system-prompt parts, in the container ADR 0008 settles as `systemPrompt`
 * (`sp_sections` on the wire). Order is fixed and lives in
 * `lib/composeSystemPrompt.ts`; this type carries membership, not sequence.
 *
 * `rules` is a list, not a string: per ADR 0009 the `_RULES` part is authored as a
 * list and joined for the prompt. The other four are single strings.
 */
export interface AppConfigSystemPrompt {
  readonly identity: string;
  readonly language: string;
  readonly voice: string;
  readonly rules: readonly string[];
  readonly formatAndFlags: string;
}

/**
 * BLOCKED BY ADR-0010 — the structure a creator supplies for a data file.
 *
 * The spec has `{ id, title, body_md }`, the build plan has `{ path, body }`, and
 * Gali's real requirement is a document plus a validated 9-key metadata record
 * (`docs/gali-ground-truth.md` §7). Those are three different shapes and 0010 has
 * not chosen. `never` means no data file can be constructed yet, which is the
 * honest state: the only assignable value is the empty list.
 */
export type UnresolvedDataFile = never;

/**
 * BLOCKED BY ADR-0011 — disclaimer format and storage location.
 *
 * The build plan says to type the field and mark it unresolved. In Gali disclaimers
 * exist twice, as an ingested KB document and as prompt text with frequency rules
 * (`docs/gali-ground-truth.md` §1.2, `functions/chat/app.py` disclaimer marker), so
 * "where do they live" is a real question with two live answers. `never` until 0011
 * settles it.
 */
export type UnresolvedDisclaimer = never;

/**
 * One validated app configuration.
 *
 * Absent on purpose, and queued rather than invented:
 *
 * - a top-level `language`. The spec's `app.config.json` has one, the build plan's
 *   `AppConfig` does not, and `_LANGUAGE` is already one of the five prompt parts.
 *   ADR 0008 fixes names and casing and says membership is still open, so the field
 *   is left out rather than added or aliased.
 * - the ADR 0009 precedence flag. The amendment makes the precedence text a per-app
 *   flag, and says in as many words that the field's name and its home — `AppConfig`,
 *   the registry row, or both — are not settled. `composeSystemPrompt` therefore
 *   takes it as an argument, and no field name is guessed here.
 */
export interface AppConfig {
  /**
   * The key tying bucket, table and registry row together, and the DynamoDB
   * partition key (ADR 0007), so it can never change after create.
   *
   * BLOCKED: validation beyond non-empty. `appName` is used verbatim as the S3
   * bucket name, so its real rule is S3 naming law — globally unique, lowercase,
   * DNS-safe. No ADR states it; see the draft on bucket naming.
   */
  readonly appName: string;

  /**
   * Which chat UI template the app renders.
   *
   * BLOCKED: the set of valid values. Nobody has enumerated the templates, so this
   * is `string` and not a union. Widening a union later is safe; narrowing one that
   * was guessed is not.
   */
  readonly uiTemplate: string;

  readonly systemPrompt: AppConfigSystemPrompt;

  /** BLOCKED BY ADR-0010. See {@link UnresolvedDataFile}. */
  readonly dataFiles: readonly UnresolvedDataFile[];

  /** BLOCKED BY ADR-0011. See {@link UnresolvedDisclaimer}. */
  readonly disclaimers: readonly UnresolvedDisclaimer[];
}
