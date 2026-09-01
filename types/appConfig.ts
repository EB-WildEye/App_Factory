import type { ColourSchemeSelection } from '@/types/colourScheme';

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
 * The structural templates that exist. **A closed enum, one member** (ADR 0023).
 *
 * `clinic-rtl` is the generalisation of Gali's current design: an RTL Hebrew shell
 * with a fixed identity rail, a paper canvas and a floating composer. The id is the
 * value both spec examples use.
 *
 * Adding a template means building one and adding it here — one list, and the schema
 * and the render path both read it. An `AppConfig` naming a template the app does not
 * ship is an app that cannot render, which is why this is an enum and not a string.
 */
export const UI_TEMPLATE_IDS = ['clinic-rtl'] as const;

export type UiTemplateId = (typeof UI_TEMPLATE_IDS)[number];

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
 * Still absent on purpose, and queued rather than invented: **a top-level
 * `language`.** The spec's `app.config.json` has one, the build plan's `AppConfig`
 * does not, and `_LANGUAGE` is already one of the five prompt parts. ADR 0008 fixes
 * names and casing and says membership is still open, so the field is left out rather
 * than added or aliased. See Q4.
 *
 * No longer absent: the ADR 0009 precedence flag is now `renderPrecedenceText`,
 * because EB settled its home — `AppConfig` only, never the registry row.
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
   * Which **structural** template the app renders. A closed enum of templates that
   * have actually been built (ADR 0023).
   *
   * Colour is deliberately not part of this — see {@link colourScheme}. A template
   * decides layout; a scheme decides paint. Keeping them separate is what stops five
   * colour choices from multiplying into five templates.
   *
   * The single member's *name* remains Q22: `clinic-rtl` is the value both spec
   * examples use, so it is the spec's word rather than a guess — but renaming it later
   * is a data migration, because the id lands in every registry row.
   */
  readonly uiTemplate: UiTemplateId;

  /**
   * The app's colours: a preset by id, or a full custom scheme (ADR 0023).
   *
   * A custom scheme must fill every role in `COLOUR_ROLES` and must clear WCAG 2.1 AA
   * on every pair in `CONTRAST_PAIRS`. Both are enforced by the schema at the
   * boundary, so an unreadable app cannot be created — checked at save time, not at
   * render time.
   */
  readonly colourScheme: ColourSchemeSelection;

  readonly systemPrompt: AppConfigSystemPrompt;

  /**
   * ADR 0009 as amended: render the precedence text into the composed prompt, or not.
   *
   * **Default on for new apps, off for Gali.** A field on `AppConfig` and nowhere else
   * — the flag changes the composed prompt, the composed prompt is built from
   * `AppConfig`, and a second copy on the registry row would eventually disagree with
   * the config that produced the prompt.
   *
   * For Gali it is off by **constraint** as well as by choice: the five-part draft
   * measures 4047 of 4096 characters, leaving 49, and the precedence paragraph is
   * roughly 200. Enabling it for Gali later means removing something else first.
   *
   * Wire name QUEUED (Q40) — no spec artefact names this field.
   */
  readonly renderPrecedenceText: boolean;

  /**
   * Where this app's daily conversation digest is emailed. Per ADR 0028 the digest
   * is the mechanism by which conversations leave the system, and DynamoDB TTL is
   * only a backstop — so an app without a recipient has nowhere to send the record
   * of what it said, and the field is required.
   *
   * The TypeScript name is `camelCase` per ADR 0008. **Its wire name is QUEUED**
   * (Q29): no spec artefact names this field, because the spec has no digest.
   * `app/api/appConfigWire.ts` therefore does not carry it yet.
   */
  readonly digestRecipientEmail: string;

  /** BLOCKED BY ADR-0010. See {@link UnresolvedDataFile}. */
  readonly dataFiles: readonly UnresolvedDataFile[];

  /** BLOCKED BY ADR-0011. See {@link UnresolvedDisclaimer}. */
  readonly disclaimers: readonly UnresolvedDisclaimer[];
}
