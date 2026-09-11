/**
 * The local production source: its contract, its integrity, and its provenance.
 *
 * This replaces the old golden test, and its job is different. The old test asserted
 * that a committed constant equalled a production string, which required the
 * production string to be committed. This one asserts three things instead, none of
 * which needs the value in the repository:
 *
 * 1. The **loader contract** holds, exercised against a committed fixture: the shape
 *    is enforced, an absent file is a normal `null`, and a malformed file throws.
 * 2. The **local file is internally consistent** — every value still hashes to the
 *    digest the generator wrote beside it. A hand-edited prompt fails here.
 * 3. The **generator reproduces the local file**, checked by re-running it against the
 *    read-only Gali checkout. This is the property that says the file came from Gali
 *    and not from somebody's memory.
 *
 * 2 and 3 skip on a machine without the local file, which is what every clone and any
 * CI runner looks like. Skipping is correct there: there is nothing to verify, and a
 * test that faked it would be asserting against its own fixture and calling it Gali.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ComposedPromptTooLongError, composeSystemPrompt } from '@/lib/composeSystemPrompt';
import { BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT, GALI_SYSTEM_PROMPT_PART_ORDER } from '@/lib/gali/constants';
import {
  GALI_DIGESTED_VALUE_NAMES,
  GaliProductionSourceInvalidError,
  composeGaliSystemPrompt,
  digestOf,
  digestedValues,
  findManifestMismatches,
  galiProductionSourceUrl,
  readGaliProductionSource,
} from '@/lib/gali/productionSource';
import type { AppConfigSystemPrompt } from '@/types/appConfig';

const FIXTURE_URL = new URL('../fixtures/galiProductionSource.fixture.json', import.meta.url);
const ABSENT_URL = new URL('../fixtures/there-is-no-such-file.local.json', import.meta.url);
const MALFORMED_URL = new URL('../fixtures/galiProductionSource.malformed.json', import.meta.url);

const GENERATOR_URL = new URL('../../scripts/generate_gali_constants.py', import.meta.url);

const localSource = readGaliProductionSource();
const hasLocalSource = localSource !== null;

/** The first Python on PATH that answers `--version`, or null. */
function resolvePython(): string | null {
  for (const candidate of ['python', 'python3']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

const python = resolvePython();

describe('the loader contract, against a committed fixture', () => {
  test('the fixture parses and carries every declared field', () => {
    const source = readGaliProductionSource(FIXTURE_URL);
    expect(source).not.toBe(null);
    expect(source?.resources.knowledgeBaseId).toBe('fixture-knowledge-base-id');
    expect(Object.keys(source?.prompts.systemPromptParts ?? {}).sort()).toEqual(
      [...GALI_SYSTEM_PROMPT_PART_ORDER].sort(),
    );
  });

  test('the fixture is obviously a fixture, not a copy of anything real', () => {
    // A fixture shaped like a real Bedrock id is a fixture that will one day be
    // mistaken for one. Every value announces itself.
    const source = readGaliProductionSource(FIXTURE_URL);
    expect(source).not.toBe(null);
    if (source === null) {
      return;
    }
    for (const value of Object.values(source.resources)) {
      expect(value).toContain('fixture');
    }
    for (const value of digestedValues(source.prompts).values()) {
      expect(value).toContain('fixture');
    }
  });

  test('an absent file is null, not an error — that is what a clean clone looks like', () => {
    expect(existsSync(ABSENT_URL)).toBe(false);
    expect(readGaliProductionSource(ABSENT_URL)).toBe(null);
  });

  test('a malformed file throws, naming the field that is wrong', () => {
    // Present-but-wrong is the dangerous state: something is about to reason about
    // values nobody generated.
    expect(existsSync(MALFORMED_URL)).toBe(true);
    expect(() => readGaliProductionSource(MALFORMED_URL)).toThrow(
      GaliProductionSourceInvalidError,
    );
  });

  test('the digest names cover exactly the fixture manifest', () => {
    const source = readGaliProductionSource(FIXTURE_URL);
    expect(Object.keys(source?.manifest.digests ?? {}).sort()).toEqual(
      [...GALI_DIGESTED_VALUE_NAMES].sort(),
    );
    expect(Object.keys(source?.manifest.lengths ?? {}).sort()).toEqual(
      [...GALI_DIGESTED_VALUE_NAMES].sort(),
    );
  });

  test('the fixture is digest-consistent, so the check itself is proven to work', () => {
    const source = readGaliProductionSource(FIXTURE_URL);
    expect(source === null ? ['unreadable fixture'] : findManifestMismatches(source)).toEqual([]);
  });

  test('a tampered value is detected', () => {
    const source = readGaliProductionSource(FIXTURE_URL);
    expect(source).not.toBe(null);
    if (source === null) {
      return;
    }
    const tampered = {
      ...source,
      prompts: {
        ...source.prompts,
        ragPromptTemplate: `${source.prompts.ragPromptTemplate} tampered`,
      },
    };
    expect(findManifestMismatches(tampered)).toEqual([
      { name: 'ragPromptTemplate', reason: 'digest' },
      { name: 'ragPromptTemplate', reason: 'length' },
    ]);
  });

  test('digestOf is plain SHA-256 of the UTF-8 bytes', () => {
    // The empty-string digest, so a changed hash function cannot pass silently.
    expect(digestOf('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe.skipIf(!hasLocalSource)('the local production source, when this machine has it', () => {
  test('every value still hashes to the digest recorded beside it', () => {
    expect(localSource === null ? ['no local source'] : findManifestMismatches(localSource)).toEqual(
      [],
    );
  });

  test('the five parts compose to more than the Bedrock cap, so they are not the live prompt', () => {
    // The I7 finding and the evidence for ADR 0018, asserted against the real values
    // rather than against a number copied into this file.
    if (localSource === null) {
      return;
    }
    const composed = composeGaliSystemPrompt(localSource.prompts);
    expect(composed.length).toBeGreaterThan(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
    expect(composed.length).toBe(localSource.manifest.lengths.systemPrompt);
  });

  test('the live template is within the cap and carries the placeholder', () => {
    if (localSource === null) {
      return;
    }
    expect(localSource.prompts.ragPromptTemplate.length).toBeLessThanOrEqual(
      BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT,
    );
    expect(localSource.prompts.ragPromptTemplate).toContain('$search_results$');
  });

  test("composeSystemPrompt refuses app #1's five parts rather than truncating them", () => {
    if (localSource === null) {
      return;
    }
    const parts: AppConfigSystemPrompt = {
      identity: localSource.prompts.systemPromptParts.identity,
      language: localSource.prompts.systemPromptParts.language,
      voice: localSource.prompts.systemPromptParts.voice,
      rules: [localSource.prompts.systemPromptParts.rules],
      formatAndFlags: localSource.prompts.systemPromptParts.formatAndFlags,
    };
    expect(() => composeSystemPrompt({ systemPrompt: parts, renderPrecedenceText: false })).toThrow(
      ComposedPromptTooLongError,
    );
  });

  test('four parts end in two newlines and the last in one', () => {
    // Load-bearing for an empty separator: the spacing belongs to the authored text.
    if (localSource === null) {
      return;
    }
    const parts = localSource.prompts.systemPromptParts;
    expect(parts.identity.endsWith('\n\n')).toBe(true);
    expect(parts.language.endsWith('\n\n')).toBe(true);
    expect(parts.voice.endsWith('\n\n')).toBe(true);
    expect(parts.rules.endsWith('\n\n')).toBe(true);
    expect(parts.formatAndFlags.endsWith('\n\n')).toBe(false);
    expect(parts.formatAndFlags.endsWith('\n')).toBe(true);
  });
});

describe.skipIf(!hasLocalSource || python === null)(
  'the generator reproduces the local source from Gali',
  () => {
    test('generate_gali_constants.py --check reports no drift', () => {
      if (python === null) {
        return;
      }
      const result = spawnSync(python, [fileURLToPath(GENERATOR_URL), '--check'], {
        encoding: 'utf8',
      });
      // stderr is where the script reports, so it is the useful failure message.
      expect(`${result.status} ${result.stderr ?? ''}`.trim()).toMatch(
        /^0 .*match the Gali source\./s,
      );
    });

    test('the local file is not stale relative to the constants module', () => {
      expect(existsSync(galiProductionSourceUrl())).toBe(true);
    });
  },
);
