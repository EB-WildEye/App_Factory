/**
 * Reads the local, gitignored file that carries Gali's production values, and proves
 * it was generated rather than typed.
 *
 * ADR 0039. Nothing in this module contains a production value; it contains the rules
 * for loading one. On a clone without the local file every function here still works —
 * `readGaliProductionSource` returns `null`, and callers say so instead of guessing.
 *
 * Server- and tooling-only: it touches the filesystem. Nothing under `app/` imports
 * it, and nothing should. The values it loads are needed by the tests and by the
 * generator, not by the browser.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import {
  GALI_SYSTEM_PROMPT_PART_ORDER,
  GALI_SYSTEM_PROMPT_SEPARATOR,
  type GaliSystemPromptPartName,
} from '@/lib/gali/constants';
import type {
  GaliDigestedValueName,
  GaliProductionPrompts,
  GaliProductionSource,
} from '@/types/galiProductionSource';

/**
 * Where the values live, relative to the repository root. Gitignored, and named
 * `.local.json` so the ignore rule is a pattern rather than one path — a second
 * private file should not need a second ignore entry to be safe.
 */
export const GALI_PRODUCTION_SOURCE_RELATIVE_PATH = 'lib/gali/gali-production-source.local.json';

/**
 * The digest name for one part. An annotated return type rather than a cast: the
 * template literal is the contract, so the compiler should be checking it here.
 */
function partDigestName(part: GaliSystemPromptPartName): GaliDigestedValueName {
  return `systemPromptParts.${part}`;
}

/** Every value the manifest digests, in a fixed order. */
export const GALI_DIGESTED_VALUE_NAMES: readonly GaliDigestedValueName[] = [
  'ragPromptTemplate',
  'classifierSystemPrompt',
  'systemPrompt',
  ...GALI_SYSTEM_PROMPT_PART_ORDER.map(partDigestName),
];

const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected a 64-character SHA-256 hex digest');

const digestsSchema = z.strictObject({
  ragPromptTemplate: sha256HexSchema,
  classifierSystemPrompt: sha256HexSchema,
  systemPrompt: sha256HexSchema,
  'systemPromptParts.identity': sha256HexSchema,
  'systemPromptParts.language': sha256HexSchema,
  'systemPromptParts.voice': sha256HexSchema,
  'systemPromptParts.rules': sha256HexSchema,
  'systemPromptParts.formatAndFlags': sha256HexSchema,
});

const positiveLength = z.number().int().positive();

const lengthsSchema = z.strictObject({
  ragPromptTemplate: positiveLength,
  classifierSystemPrompt: positiveLength,
  systemPrompt: positiveLength,
  'systemPromptParts.identity': positiveLength,
  'systemPromptParts.language': positiveLength,
  'systemPromptParts.voice': positiveLength,
  'systemPromptParts.rules': positiveLength,
  'systemPromptParts.formatAndFlags': positiveLength,
});

const nonEmpty = z.string().min(1);

/**
 * The file's shape. Strict throughout: an unknown key means the generator and this
 * reader disagree about the contract, and silently stripping it is how they stay
 * disagreeing.
 */
export const galiProductionSourceSchema = z.strictObject({
  manifest: z.strictObject({
    generatedAt: nonEmpty,
    backendCommit: nonEmpty,
    frontendCommit: nonEmpty,
    digests: digestsSchema,
    lengths: lengthsSchema,
  }),
  resources: z.strictObject({
    knowledgeBaseId: nonEmpty,
    customDataSourceId: nonEmpty,
    syncDataSourceId: nonEmpty,
    primaryModelId: nonEmpty,
    fallbackModelId: nonEmpty,
    chatTableNamePattern: nonEmpty,
    chatTableNameDefault: nonEmpty,
  }),
  prompts: z.strictObject({
    ragPromptTemplate: nonEmpty,
    classifierSystemPrompt: nonEmpty,
    systemPromptParts: z.strictObject({
      identity: nonEmpty,
      language: nonEmpty,
      voice: nonEmpty,
      rules: nonEmpty,
      formatAndFlags: nonEmpty,
    }),
  }),
});

/** The URL of the local file, resolved from this module rather than from the cwd. */
export function galiProductionSourceUrl(): URL {
  return new URL(`../../${GALI_PRODUCTION_SOURCE_RELATIVE_PATH}`, import.meta.url);
}

/** SHA-256 of a string, UTF-8, lowercase hex. */
export function digestOf(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** The five parts joined the way Gali joins them. */
export function composeGaliSystemPrompt(prompts: GaliProductionPrompts): string {
  return GALI_SYSTEM_PROMPT_PART_ORDER.map((part) => prompts.systemPromptParts[part]).join(
    GALI_SYSTEM_PROMPT_SEPARATOR,
  );
}

/** Every digested value, resolved from the prompts. Keys match `GALI_DIGESTED_VALUE_NAMES`. */
export function digestedValues(
  prompts: GaliProductionPrompts,
): ReadonlyMap<GaliDigestedValueName, string> {
  const values = new Map<GaliDigestedValueName, string>([
    ['ragPromptTemplate', prompts.ragPromptTemplate],
    ['classifierSystemPrompt', prompts.classifierSystemPrompt],
    ['systemPrompt', composeGaliSystemPrompt(prompts)],
  ]);

  for (const part of GALI_SYSTEM_PROMPT_PART_ORDER) {
    values.set(`systemPromptParts.${part}`, prompts.systemPromptParts[part]);
  }

  return values;
}

/** One value whose recorded digest or length disagrees with the value itself. */
export interface ManifestMismatch {
  readonly name: GaliDigestedValueName;
  readonly reason: 'digest' | 'length';
}

/**
 * Check the file against itself.
 *
 * This is the integrity property that replaces the old committed digest table: a
 * value edited by hand no longer matches the digest the generator wrote next to it.
 * It cannot detect a wholesale regeneration from a modified Gali — nothing in this
 * repository can, and nothing should try, since Gali is the authority.
 */
export function findManifestMismatches(source: GaliProductionSource): readonly ManifestMismatch[] {
  const mismatches: ManifestMismatch[] = [];

  for (const [name, value] of digestedValues(source.prompts)) {
    if (source.manifest.digests[name] !== digestOf(value)) {
      mismatches.push({ name, reason: 'digest' });
    }
    if (source.manifest.lengths[name] !== value.length) {
      mismatches.push({ name, reason: 'length' });
    }
  }

  return mismatches;
}

/** Thrown when the local file exists but is not what the generator writes. */
export class GaliProductionSourceInvalidError extends Error {
  constructor(path: string, cause: string) {
    super(
      `${path} exists but is not a valid Gali production source: ${cause}. ` +
        `Regenerate it with scripts/generate_gali_constants.py.`,
    );
    this.name = 'GaliProductionSourceInvalidError';
  }
}

/**
 * Load the local file, or `null` when it is absent.
 *
 * Absent is a normal state, not an error: it is what every clone looks like, and what
 * CI looks like. Present-but-wrong is an error, because it means something is about to
 * reason about values nobody generated.
 *
 * @throws {GaliProductionSourceInvalidError} when the file exists and does not parse.
 */
export function readGaliProductionSource(
  fileUrl: URL = galiProductionSourceUrl(),
): GaliProductionSource | null {
  if (!existsSync(fileUrl)) {
    return null;
  }

  const raw: unknown = JSON.parse(readFileSync(fileUrl, 'utf8'));
  const parsed = galiProductionSourceSchema.safeParse(raw);

  if (!parsed.success) {
    throw new GaliProductionSourceInvalidError(
      GALI_PRODUCTION_SOURCE_RELATIVE_PATH,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }

  return parsed.data;
}
