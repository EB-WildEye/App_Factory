/**
 * The `AppConfig` zod schema.
 *
 * The reference fixture is Gali-shaped on purpose: the milestone is done when
 * generic-Gali, given Gali's own config, reproduces today's Gali. If the schema
 * cannot accept Gali, nothing downstream matters.
 */

import { describe, expect, test } from 'bun:test';

import { appConfigSchema, parseAppConfig } from '@/lib/appConfigSchema';
import { GALI_SYSTEM_PROMPT_PARTS } from '@/lib/gali/constants';
import type { AppConfig } from '@/types/appConfig';

/**
 * A Gali-shaped config. The prompt parts are Gali's real text; `uiTemplate` is the
 * spec's own example value; `dataFiles` and `disclaimers` are empty because their
 * element shapes are blocked by ADR-0010 and ADR-0011.
 */
const GALI_CONFIG: AppConfig = {
  appName: 'gali',
  uiTemplate: 'clinic-rtl',
  systemPrompt: {
    identity: GALI_SYSTEM_PROMPT_PARTS.identity,
    language: GALI_SYSTEM_PROMPT_PARTS.language,
    voice: GALI_SYSTEM_PROMPT_PARTS.voice,
    rules: [GALI_SYSTEM_PROMPT_PARTS.rules],
    formatAndFlags: GALI_SYSTEM_PROMPT_PARTS.formatAndFlags,
  },
  dataFiles: [],
  disclaimers: [],
};

const REQUIRED_TOP_LEVEL_FIELDS = [
  'appName',
  'uiTemplate',
  'systemPrompt',
  'dataFiles',
  'disclaimers',
] as const;

const REQUIRED_PROMPT_PARTS = [
  'identity',
  'language',
  'voice',
  'rules',
  'formatAndFlags',
] as const;

/** A mutable copy, so a test can remove or add a key without fighting the types. */
function mutableCopy(config: AppConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

describe('appConfigSchema — accepts a valid Gali-shaped config', () => {
  test('the fixture parses', () => {
    expect(appConfigSchema.safeParse(GALI_CONFIG).success).toBe(true);
  });

  test('parseAppConfig returns the config unchanged', () => {
    expect(parseAppConfig(GALI_CONFIG)).toEqual(GALI_CONFIG);
  });

  test("Gali's real prompt text survives validation byte for byte", () => {
    const parsed = parseAppConfig(GALI_CONFIG);
    expect(parsed.systemPrompt.identity).toBe(GALI_SYSTEM_PROMPT_PARTS.identity);
    expect(parsed.systemPrompt.rules).toEqual([GALI_SYSTEM_PROMPT_PARTS.rules]);
    expect(parsed.systemPrompt.formatAndFlags).toBe(
      GALI_SYSTEM_PROMPT_PARTS.formatAndFlags,
    );
  });

  test('a many-rule list is accepted — rules are authored as a list (ADR 0009)', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.systemPrompt = { ...GALI_CONFIG.systemPrompt, rules: ['one', 'two', 'three'] };
    expect(appConfigSchema.safeParse(config).success).toBe(true);
  });

  test('an empty rule list is accepted — the cap, not the schema, constrains content', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.systemPrompt = { ...GALI_CONFIG.systemPrompt, rules: [] };
    expect(appConfigSchema.safeParse(config).success).toBe(true);
  });
});

describe('appConfigSchema — rejects an empty appName', () => {
  test('the empty string is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.appName = '';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a wrong-typed appName is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.appName = 42;
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('an empty uiTemplate is rejected too', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.uiTemplate = '';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe('appConfigSchema — rejects unknown fields', () => {
  test('an unknown top-level field is rejected, not stripped', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.language = 'he';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a top-level rules array is rejected — ADR 0009 rejected that reading', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.rules = ['rule_01'];
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a sixth prompt part is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.systemPrompt = { ...GALI_CONFIG.systemPrompt, precedence: 'on' };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a wire-cased field name is rejected — camelCase above the boundary (ADR 0008)', () => {
    const config = mutableCopy(GALI_CONFIG);
    delete config.appName;
    config.app_name = 'gali';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe('appConfigSchema — rejects each required field being absent', () => {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    test(`without ${field}`, () => {
      const config = mutableCopy(GALI_CONFIG);
      delete config[field];
      expect(appConfigSchema.safeParse(config).success).toBe(false);
    });
  }

  for (const part of REQUIRED_PROMPT_PARTS) {
    test(`without systemPrompt.${part}`, () => {
      const config = mutableCopy(GALI_CONFIG);
      const systemPrompt: Record<string, unknown> = { ...GALI_CONFIG.systemPrompt };
      delete systemPrompt[part];
      config.systemPrompt = systemPrompt;
      expect(appConfigSchema.safeParse(config).success).toBe(false);
    });
  }
});

describe('appConfigSchema — the blocked fields accept nothing but an empty list', () => {
  test('a data file cannot be constructed while ADR-0010 is open', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.dataFiles = [{ path: 'kb/prep.md', body: '# prep' }];
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a disclaimer cannot be constructed while ADR-0011 is open', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.disclaimers = ['informational only'];
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });
});
