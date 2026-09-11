/**
 * Golden test for `lib/gali/constants.ts` — the STRUCTURE the factory copies from Gali.
 *
 * Every value pinned here is a shape, an order, a limit or a schema. None of them is a
 * production identifier and none of them is prompt text: those moved out of the
 * repository under ADR 0039, and what verifies them is
 * `tests/gali/productionSource.test.ts`.
 *
 * Each scalar is pinned against a literal written out below with its provenance, so a
 * changed scalar has to be changed in two places by someone who knows why. That is the
 * whole mechanism: `constants.ts` is generated, and a regeneration that changed one of
 * these would mean Gali itself changed, which is a fact worth stopping for.
 */

import { describe, expect, test } from 'bun:test';

import {
  BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT,
  BEDROCK_SEARCH_RESULTS_PLACEHOLDER,
  GALI_CHAT_TABLE_KEY_SCHEMA,
  GALI_CHAT_TABLE_STAGES,
  GALI_CHAT_TABLE_TTL_ATTRIBUTE,
  GALI_CHAT_TABLE_TTL_TIMEZONE,
  GALI_CLASSIFIER_API,
  GALI_CLASSIFIER_MAX_TOKENS,
  GALI_CLASSIFIER_PROMPT_LOCKED_AT,
  GALI_CLASSIFIER_TEMPERATURE,
  GALI_DATA_SOURCE_TYPE,
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
  GALI_QUERY_TRANSFORMATION_TYPE,
  GALI_REGION,
  GALI_RETRIEVAL_TOP_K,
  GALI_SYSTEM_PROMPT_PART_ORDER,
  GALI_SYSTEM_PROMPT_SEPARATOR,
  GALI_TRIAGE_FAIL_SAFE_TIER,
  GALI_TRIAGE_TIERS,
} from '@/lib/gali/constants';

describe('gali constants — the module carries no production value (ADR 0039)', () => {
  test('nothing exported here looks like a Bedrock resource id', () => {
    // Ten uppercase alphanumerics is the shape of a knowledge base or data source id.
    // The repository-wide guard in tests/repository/secretScan.test.ts is the real
    // defence; this is the same check aimed at the one module most likely to regain
    // one, because it is generated and a generator is easy to edit.
    const exported = [
      GALI_REGION,
      GALI_DATA_SOURCE_TYPE,
      GALI_QUERY_TRANSFORMATION_TYPE,
      GALI_CLASSIFIER_API,
      GALI_CLASSIFIER_PROMPT_LOCKED_AT,
      GALI_CHAT_TABLE_TTL_ATTRIBUTE,
      GALI_CHAT_TABLE_TTL_TIMEZONE,
      GALI_KB_METADATA_LANGUAGE,
      GALI_KB_METADATA_SOURCE,
      GALI_KB_METADATA_VERSION_DEFAULT,
      ...GALI_TRIAGE_TIERS,
      ...GALI_CHAT_TABLE_STAGES,
    ];
    for (const value of exported) {
      expect(/^[A-Z0-9]{10}$/.test(value)).toBe(false);
    }
  });
});

describe('gali constants — region, data source and inference settings', () => {
  test('region and data source type', () => {
    // shared/shared/config.py:14, scripts/ingest_kb.py:222
    expect(GALI_REGION).toBe('eu-west-1');
    expect(GALI_DATA_SOURCE_TYPE).toBe('CUSTOM');
  });

  test('the data source type is CUSTOM, which is not what the spec assumes', () => {
    // The spec's R5 says the data source points at s3://<app>/kb/. App #1 does not.
    // Recorded as a pin so the mismatch cannot quietly disappear. See ADR 0018, 0030.
    expect(GALI_DATA_SOURCE_TYPE).not.toBe('S3');
  });

  test('retrieval and generation settings', () => {
    // shared/shared/config.py:27,34,35, functions/chat/app.py:123
    expect(GALI_RETRIEVAL_TOP_K).toBe(5);
    expect(GALI_GENERATION_MAX_TOKENS).toBe(4096);
    expect(GALI_GENERATION_TEMPERATURE).toBe(0.3);
    expect(GALI_QUERY_TRANSFORMATION_TYPE).toBe('QUERY_DECOMPOSITION');
  });
});

describe('gali constants — prompt composition', () => {
  test('the order is fixed and the separator is empty', () => {
    // shared/shared/prompt.py:293 — a bare concatenation, so the separator is empty.
    expect(GALI_SYSTEM_PROMPT_SEPARATOR).toBe('');
    expect([...GALI_SYSTEM_PROMPT_PART_ORDER]).toEqual([
      'identity',
      'language',
      'voice',
      'rules',
      'formatAndFlags',
    ]);
  });

  test('the cap and the required placeholder', () => {
    // shared/shared/prompt.py:406-416. The 4096 is contested (Q43) and the factory's
    // own authoring budget is lower again — this constant is the service limit as Gali
    // asserts it, not the budget an author gets.
    expect(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT).toBe(4096);
    expect(BEDROCK_SEARCH_RESULTS_PLACEHOLDER).toBe('$search_results$');
  });
});

describe('gali constants — the triage classifier', () => {
  test('tiers, fail-safe and call settings', () => {
    // shared/shared/redflag_classifier.py:58-71, :213-247, locked at a635c2e.
    expect([...GALI_TRIAGE_TIERS]).toEqual(['ER', 'CLARIFY_ER', 'SOFT', 'EXPLAIN']);
    expect(GALI_TRIAGE_FAIL_SAFE_TIER).toBe('ER');
    expect(GALI_CLASSIFIER_MAX_TOKENS).toBe(8);
    expect(GALI_CLASSIFIER_TEMPERATURE).toBe(0);
    expect(GALI_CLASSIFIER_API).toBe('bedrock-runtime.Converse');
    expect(GALI_CLASSIFIER_PROMPT_LOCKED_AT).toBe('a635c2e');
  });

  test('the fail-safe tier is the most severe one, not the cheapest', () => {
    // Any API error, empty response or unparseable label resolves to ER, so a missed
    // classification can never suppress an escalation. That is the property.
    expect(GALI_TRIAGE_FAIL_SAFE_TIER).toBe(GALI_TRIAGE_TIERS[0]);
  });
});

describe('gali constants — the chat-history table shape', () => {
  test('composite key, TTL attribute and timezone', () => {
    // template.yaml:87-105, shared/shared/time_utils.py:10
    expect(GALI_CHAT_TABLE_TTL_ATTRIBUTE).toBe('ttl');
    expect(GALI_CHAT_TABLE_TTL_TIMEZONE).toBe('Asia/Jerusalem');
    expect([...GALI_CHAT_TABLE_KEY_SCHEMA]).toEqual([
      { attributeName: 'session_id', keyType: 'HASH', attributeType: 'S' },
      { attributeName: 'timestamp', keyType: 'RANGE', attributeType: 'N' },
    ]);
    expect([...GALI_CHAT_TABLE_STAGES]).toEqual(['dev', 'prod']);
  });

  test('the TTL attribute is ttl, not the spec R7 name', () => {
    expect(GALI_CHAT_TABLE_TTL_ATTRIBUTE).not.toBe('expires_at');
  });
});

describe('gali constants — the 9-key KB metadata schema', () => {
  test('keys, order and optionality', () => {
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
  });

  test('inline attribute types and the fixed values', () => {
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
