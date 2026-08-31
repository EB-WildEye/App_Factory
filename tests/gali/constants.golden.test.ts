/**
 * Golden test for `lib/gali/constants.ts`.
 *
 * The constants in that module were copied out of the read-only Gali repos. This test
 * is what stops them drifting: `docs/gali-ground-truth.md` carries a digest table
 * that was computed from the Gali source, this test hashes what the module actually
 * exports, and the two must agree. Editing a constant without re-reading Gali — or
 * editing the document without re-reading Gali — fails here.
 *
 * The scalars are pinned against literals written out below with their provenance, so
 * a changed scalar has to be changed in two places by someone who knows why.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT,
  BEDROCK_SEARCH_RESULTS_PLACEHOLDER,
  GALI_CHAT_TABLE_KEY_SCHEMA,
  GALI_CHAT_TABLE_NAME_DEFAULT,
  GALI_CHAT_TABLE_NAME_PATTERN,
  GALI_CHAT_TABLE_TTL_ATTRIBUTE,
  GALI_CHAT_TABLE_TTL_TIMEZONE,
  GALI_CLASSIFIER_MAX_TOKENS,
  GALI_CLASSIFIER_PROMPT_LOCKED_AT,
  GALI_CLASSIFIER_SYSTEM_PROMPT,
  GALI_CLASSIFIER_TEMPERATURE,
  GALI_CUSTOM_DATA_SOURCE_ID,
  GALI_DATA_SOURCE_TYPE,
  GALI_FALLBACK_MODEL_ID,
  GALI_GENERATION_MAX_TOKENS,
  GALI_GENERATION_TEMPERATURE,
  GALI_KB_METADATA_ATTRIBUTE_TYPES,
  GALI_KB_METADATA_KEYS,
  GALI_KB_METADATA_LANGUAGE,
  GALI_KB_METADATA_OPTIONAL_KEYS,
  GALI_KB_METADATA_SOURCE,
  GALI_KB_METADATA_VERSION_DEFAULT,
  GALI_KB_METADATA_VERSION_PATTERN,
  GALI_KB_TOPIC_TAGS_MAX,
  GALI_KB_TOPIC_TAGS_MIN,
  GALI_KNOWLEDGE_BASE_ID,
  GALI_PRIMARY_MODEL_ID,
  GALI_QUERY_TRANSFORMATION_TYPE,
  GALI_RAG_PROMPT_TEMPLATE,
  GALI_REGION,
  GALI_RETRIEVAL_TOP_K,
  GALI_SYNC_DATA_SOURCE_ID,
  GALI_SYSTEM_PROMPT,
  GALI_SYSTEM_PROMPT_PART_ORDER,
  GALI_SYSTEM_PROMPT_PARTS,
  GALI_SYSTEM_PROMPT_SEPARATOR,
  GALI_TRIAGE_FAIL_SAFE_TIER,
  GALI_TRIAGE_TIERS,
} from '@/lib/gali/constants';

const GROUND_TRUTH_URL = new URL('../../docs/gali-ground-truth.md', import.meta.url);

/** `| `NAME` | 1234 | `<64 hex>` |` */
const DIGEST_ROW = /^\| `([A-Za-z0-9_.]+)` \| (\d+) \| `([0-9a-f]{64})` \|$/;

interface GoldenEntry {
  readonly length: number;
  readonly sha256: string;
}

function readGoldenTable(): Map<string, GoldenEntry> {
  const document = readFileSync(GROUND_TRUTH_URL, 'utf8');
  const table = new Map<string, GoldenEntry>();

  for (const line of document.split('\n')) {
    const match = DIGEST_ROW.exec(line.trim());
    if (match === null) {
      continue;
    }
    const [, name, length, sha256] = match;
    if (name === undefined || length === undefined || sha256 === undefined) {
      continue;
    }
    table.set(name, { length: Number(length), sha256 });
  }

  return table;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Every string constant the ground-truth document is expected to pin. */
const PINNED_STRINGS: ReadonlyMap<string, string> = new Map([
  ['GALI_RAG_PROMPT_TEMPLATE', GALI_RAG_PROMPT_TEMPLATE],
  ['GALI_SYSTEM_PROMPT_PARTS.identity', GALI_SYSTEM_PROMPT_PARTS.identity],
  ['GALI_SYSTEM_PROMPT_PARTS.language', GALI_SYSTEM_PROMPT_PARTS.language],
  ['GALI_SYSTEM_PROMPT_PARTS.voice', GALI_SYSTEM_PROMPT_PARTS.voice],
  ['GALI_SYSTEM_PROMPT_PARTS.rules', GALI_SYSTEM_PROMPT_PARTS.rules],
  ['GALI_SYSTEM_PROMPT_PARTS.formatAndFlags', GALI_SYSTEM_PROMPT_PARTS.formatAndFlags],
  ['GALI_SYSTEM_PROMPT', GALI_SYSTEM_PROMPT],
  ['GALI_CLASSIFIER_SYSTEM_PROMPT', GALI_CLASSIFIER_SYSTEM_PROMPT],
]);

describe('gali constants — golden against docs/gali-ground-truth.md', () => {
  const golden = readGoldenTable();

  test('the document pins exactly the constants this test knows about', () => {
    expect([...golden.keys()].sort()).toEqual([...PINNED_STRINGS.keys()].sort());
  });

  for (const [name, value] of PINNED_STRINGS) {
    test(`${name} is byte-identical to the recorded digest`, () => {
      const entry = golden.get(name);
      expect(entry).not.toBe(undefined);
      expect(value.length).toBe(entry?.length);
      expect(sha256(value)).toBe(entry?.sha256);
    });
  }
});

describe('gali constants — the two assertions Gali makes about its own prompt', () => {
  // shared/shared/prompt.py:410 and :413-416, asserted at import time there.
  test('the live template contains the search-results placeholder', () => {
    expect(GALI_RAG_PROMPT_TEMPLATE).toContain(BEDROCK_SEARCH_RESULTS_PLACEHOLDER);
  });

  test('the live template is within the Bedrock cap', () => {
    expect(GALI_RAG_PROMPT_TEMPLATE.length).toBeLessThanOrEqual(
      BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT,
    );
  });

  test('the five-part composition is far over the cap, so it cannot be the live prompt', () => {
    expect(GALI_SYSTEM_PROMPT.length).toBeGreaterThan(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
  });
});

describe('gali constants — scalars, each pinned to what the Gali repo states', () => {
  test('region and Bedrock ids', () => {
    // shared/shared/config.py:14, scripts/ingest_kb.py:32-34, samconfig.toml:10
    expect(GALI_REGION).toBe('eu-west-1');
    expect(GALI_KNOWLEDGE_BASE_ID).toBe('CHAU7BWP4S');
    expect(GALI_CUSTOM_DATA_SOURCE_ID).toBe('PPIUPPCKNN');
    expect(GALI_SYNC_DATA_SOURCE_ID).toBe('FDN4IETFFW');
    expect(GALI_DATA_SOURCE_TYPE).toBe('CUSTOM');
  });

  test('the two data source ids are not the same value', () => {
    // Recorded as a discrepancy, not resolved. See QUESTIONS.md Q1.
    expect(GALI_CUSTOM_DATA_SOURCE_ID).not.toBe(GALI_SYNC_DATA_SOURCE_ID);
  });

  test('models and inference settings', () => {
    // samconfig.toml:10, shared/shared/config.py:27,34,35, functions/chat/app.py:123
    expect(GALI_PRIMARY_MODEL_ID).toBe('eu.anthropic.claude-sonnet-4-5-20250929-v1:0');
    expect(GALI_FALLBACK_MODEL_ID).toBe('eu.anthropic.claude-3-5-haiku-20241022-v1:0');
    expect(GALI_RETRIEVAL_TOP_K).toBe(5);
    expect(GALI_GENERATION_MAX_TOKENS).toBe(4096);
    expect(GALI_GENERATION_TEMPERATURE).toBe(0.3);
    expect(GALI_QUERY_TRANSFORMATION_TYPE).toBe('QUERY_DECOMPOSITION');
  });

  test('prompt composition', () => {
    // shared/shared/prompt.py:293 — a bare concatenation, so the separator is empty.
    expect(GALI_SYSTEM_PROMPT_SEPARATOR).toBe('');
    expect([...GALI_SYSTEM_PROMPT_PART_ORDER]).toEqual([
      'identity',
      'language',
      'voice',
      'rules',
      'formatAndFlags',
    ]);
    expect(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT).toBe(4096);
    expect(BEDROCK_SEARCH_RESULTS_PLACEHOLDER).toBe('$search_results$');
  });

  test('four parts end in two newlines and the last in one', () => {
    // Load-bearing for an empty separator: the spacing belongs to the authored text.
    expect(GALI_SYSTEM_PROMPT_PARTS.identity.endsWith('\n\n')).toBe(true);
    expect(GALI_SYSTEM_PROMPT_PARTS.language.endsWith('\n\n')).toBe(true);
    expect(GALI_SYSTEM_PROMPT_PARTS.voice.endsWith('\n\n')).toBe(true);
    expect(GALI_SYSTEM_PROMPT_PARTS.rules.endsWith('\n\n')).toBe(true);
    expect(GALI_SYSTEM_PROMPT_PARTS.formatAndFlags.endsWith('\n\n')).toBe(false);
    expect(GALI_SYSTEM_PROMPT_PARTS.formatAndFlags.endsWith('\n')).toBe(true);
  });

  test('the classifier', () => {
    // shared/shared/redflag_classifier.py:58-71, locked at a635c2e (2026-07-05)
    expect([...GALI_TRIAGE_TIERS]).toEqual(['ER', 'CLARIFY_ER', 'SOFT', 'EXPLAIN']);
    expect(GALI_TRIAGE_FAIL_SAFE_TIER).toBe('ER');
    expect(GALI_CLASSIFIER_MAX_TOKENS).toBe(8);
    expect(GALI_CLASSIFIER_TEMPERATURE).toBe(0);
    expect(GALI_CLASSIFIER_PROMPT_LOCKED_AT).toBe('a635c2e');
  });

  test('the chat-history table', () => {
    // template.yaml:87-105, shared/shared/config.py:17, shared/shared/time_utils.py:10
    expect(GALI_CHAT_TABLE_NAME_PATTERN).toBe('gali-sessions-${Stage}');
    expect(GALI_CHAT_TABLE_NAME_DEFAULT).toBe('gali-sessions-dev');
    expect(GALI_CHAT_TABLE_TTL_ATTRIBUTE).toBe('ttl');
    expect(GALI_CHAT_TABLE_TTL_TIMEZONE).toBe('Asia/Jerusalem');
    expect([...GALI_CHAT_TABLE_KEY_SCHEMA]).toEqual([
      { attributeName: 'session_id', keyType: 'HASH', attributeType: 'S' },
      { attributeName: 'timestamp', keyType: 'RANGE', attributeType: 'N' },
    ]);
  });

  test('the TTL attribute is ttl, not the spec R7 name', () => {
    expect(GALI_CHAT_TABLE_TTL_ATTRIBUTE).not.toBe('expires_at');
  });

  test('the 9-key KB metadata schema', () => {
    // scripts/ingest_kb.py:37-44, :166-191, :201-214
    expect([...GALI_KB_METADATA_KEYS]).toEqual([
      'doc_type',
      'procedure_type',
      'gestational_age_max_weeks',
      'topic_tags',
      'contains_red_flags',
      'contains_emotional_support',
      'language',
      'source',
      'version',
    ]);
    expect(GALI_KB_METADATA_KEYS).toHaveLength(9);
    expect([...GALI_KB_METADATA_OPTIONAL_KEYS]).toEqual(['gestational_age_max_weeks']);
    expect(GALI_KB_METADATA_ATTRIBUTE_TYPES).toEqual({
      doc_type: 'STRING',
      procedure_type: 'STRING',
      gestational_age_max_weeks: 'NUMBER',
      topic_tags: 'STRING_LIST',
      contains_red_flags: 'BOOLEAN',
      contains_emotional_support: 'BOOLEAN',
      language: 'STRING',
      source: 'STRING',
      version: 'STRING',
    });
    expect(GALI_KB_METADATA_LANGUAGE).toBe('he');
    expect(GALI_KB_METADATA_SOURCE).toBe('Wolfson Medical Center');
    expect(GALI_KB_METADATA_VERSION_DEFAULT).toBe('2026-06');
    expect(GALI_KB_TOPIC_TAGS_MIN).toBe(1);
    expect(GALI_KB_TOPIC_TAGS_MAX).toBe(10);
  });

  test('the version pattern accepts YYYY-MM and nothing else', () => {
    expect(GALI_KB_METADATA_VERSION_PATTERN.test('2026-06')).toBe(true);
    expect(GALI_KB_METADATA_VERSION_PATTERN.test('2026-07')).toBe(true);
    expect(GALI_KB_METADATA_VERSION_PATTERN.test('2026-6')).toBe(false);
    expect(GALI_KB_METADATA_VERSION_PATTERN.test('2026-06-21')).toBe(false);
  });
});
