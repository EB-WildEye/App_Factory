/**
 * The shape of the local, never-committed file that carries Gali's production values.
 *
 * ADR 0039. This repository is public. Gali's clinical prompt text, its Bedrock
 * resource ids, its inference profile ids and its table names are production facts
 * about a live clinical system, and they do not live in a public repository — not in
 * the working tree, not in the history.
 *
 * What lives here instead is the *contract*: the set of values the factory needs to
 * reproduce app #1, typed, so that everything which reasons about them still
 * typechecks on a machine that has never seen the values. The values themselves come
 * from `lib/gali/gali-production-source.local.json`, which is gitignored and is
 * regenerated from the read-only Gali repos by
 * `scripts/generate_gali_constants.py`.
 *
 * A clone without that file is a working clone: the app builds, the gates pass, and
 * every test that needs values reads the committed fixture instead.
 */

import type { GaliSystemPromptPartName } from '@/lib/gali/constants';

/**
 * Production resource identifiers. Every one of these is a name AWS will answer to,
 * which is exactly why none of them is committed.
 */
export interface GaliProductionResources {
  readonly knowledgeBaseId: string;
  readonly customDataSourceId: string;
  readonly syncDataSourceId: string;
  readonly primaryModelId: string;
  readonly fallbackModelId: string;
  readonly chatTableNamePattern: string;
  readonly chatTableNameDefault: string;
}

/**
 * The clinical prompt text. Three separate artefacts, none of them interchangeable:
 *
 * - `ragPromptTemplate` — what production sends per turn.
 * - `systemPromptParts` — the five documentation parts, which compose to something
 *   far longer than the service cap and are therefore not what production sends.
 * - `classifierSystemPrompt` — the pre-retrieval triage classifier, whose escalation
 *   thresholds are the part with clinical consequences.
 */
export interface GaliProductionPrompts {
  readonly ragPromptTemplate: string;
  readonly classifierSystemPrompt: string;
  readonly systemPromptParts: Readonly<Record<GaliSystemPromptPartName, string>>;
}

/**
 * Every value the manifest carries a digest and a length for.
 *
 * `systemPrompt` is derived — the five parts joined — and is digested anyway, so that
 * a hand-edit of one part is caught by two independent checks rather than one.
 */
export type GaliDigestedValueName =
  | 'ragPromptTemplate'
  | 'classifierSystemPrompt'
  | 'systemPrompt'
  | `systemPromptParts.${GaliSystemPromptPartName}`;

/**
 * Provenance and integrity, written by the generator alongside the values.
 *
 * The digests are what make the local file verifiable without a committed copy of
 * what it should contain: recomputing them from the values proves the file was
 * produced by the generator and not typed by hand. That is the property the old
 * golden test got from a committed digest table, obtained now without publishing
 * anything about the prompt.
 */
export interface GaliProductionSourceManifest {
  readonly generatedAt: string;
  readonly backendCommit: string;
  readonly frontendCommit: string;
  readonly digests: Readonly<Record<GaliDigestedValueName, string>>;
  readonly lengths: Readonly<Record<GaliDigestedValueName, number>>;
}

/** The whole local file. */
export interface GaliProductionSource {
  readonly manifest: GaliProductionSourceManifest;
  readonly resources: GaliProductionResources;
  readonly prompts: GaliProductionPrompts;
}
