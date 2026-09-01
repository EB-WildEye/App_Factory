/**
 * The `AppConfig` zod schema.
 *
 * The reference fixture is Gali-shaped on purpose: the milestone is done when
 * generic-Gali, given Gali's own config, reproduces today's Gali. If the schema
 * cannot accept Gali, nothing downstream matters.
 */

import { describe, expect, test } from 'bun:test';

import { appConfigSchema, parseAppConfig } from '@/lib/appConfigSchema';
import { CLINICAL_BLUE_SCHEME, GALI_SAGE_SCHEME } from '@/lib/colourSchemes';
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
  colourScheme: { kind: 'preset', presetId: 'gali-sage' },
  renderPrecedenceText: false,
  digestRecipientEmail: 'gynecology-digest@wolfson.example.gov.il',
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
  'colourScheme',
  'renderPrecedenceText',
  'digestRecipientEmail',
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

describe('appConfigSchema — the digest recipient (ADR 0028)', () => {
  test('a well-formed address is accepted', () => {
    expect(appConfigSchema.safeParse(GALI_CONFIG).success).toBe(true);
  });

  test('a malformed address is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.digestRecipientEmail = 'not-an-address';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('an empty address is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.digestRecipientEmail = '';
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('the field survives validation byte for byte', () => {
    // The digest is the mechanism conversations leave by, so the address the
    // creator typed is the address the job must use.
    expect(parseAppConfig(GALI_CONFIG).digestRecipientEmail).toBe(
      'gynecology-digest@wolfson.example.gov.il',
    );
  });
});

describe('appConfigSchema — the colour scheme (ADR 0023)', () => {
  test('a preset by id is accepted', () => {
    expect(appConfigSchema.safeParse(GALI_CONFIG).success).toBe(true);
  });

  test('an unknown preset id is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = { kind: 'preset', presetId: 'not-a-scheme' };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a complete, contrast-passing custom scheme is accepted', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = { kind: 'custom', colours: { ...CLINICAL_BLUE_SCHEME } };
    expect(appConfigSchema.safeParse(config).success).toBe(true);
  });

  test('a custom scheme missing one role is rejected', () => {
    // The whole point of the closed role set: a partial scheme leaves the template
    // painting with undefined, which renders as "inherit" and looks broken.
    const colours: Record<string, unknown> = { ...CLINICAL_BLUE_SCHEME };
    delete colours.focusRing;
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = { kind: 'custom', colours };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a custom scheme with an extra role is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = {
      kind: 'custom',
      colours: { ...CLINICAL_BLUE_SCHEME, surfaceMystery: '#123456' },
    };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a custom scheme with a malformed colour is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = {
      kind: 'custom',
      colours: { ...CLINICAL_BLUE_SCHEME, textPrimary: '#ABC' },
    };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a custom scheme that fails WCAG AA is rejected at save time', () => {
    // Light grey body text on a white canvas: legible to the person who chose it on a
    // good monitor, and not to a patient on a phone in daylight.
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = {
      kind: 'custom',
      colours: { ...CLINICAL_BLUE_SCHEME, textPrimary: '#b0b0b0' },
    };
    const result = appConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test('every failing pair is reported, not just the first', () => {
    // A creator fixing one colour at a time through a sequence of errors is in a maze.
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = {
      kind: 'custom',
      colours: { ...CLINICAL_BLUE_SCHEME, textPrimary: '#b0b0b0' },
    };
    const result = appConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    // textPrimary is checked against four surfaces, so a bad value fails four pairs.
    expect(result.error?.issues.length).toBe(4);
  });

  test("Gali's own preset is accepted even though it fails AA, because presets are not contrast-gated", () => {
    // Deliberate and recorded in ADR 0023: the gate is on custom schemes. Gating the
    // preset would make app #1 uncreatable by the factory that exists to create it.
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = { kind: 'preset', presetId: 'gali-sage' };
    expect(appConfigSchema.safeParse(config).success).toBe(true);
  });

  test('the same values supplied as a custom scheme ARE rejected', () => {
    // The asymmetry is the whole design, so it is pinned: identical colours, different
    // answer, because one is a recorded exception and the other is a new choice.
    const config = mutableCopy(GALI_CONFIG);
    config.colourScheme = { kind: 'custom', colours: { ...GALI_SAGE_SCHEME } };
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe('appConfigSchema — the precedence flag (ADR 0009, EB 2026-09-01)', () => {
  test('false is accepted — the Gali case', () => {
    expect(appConfigSchema.safeParse(GALI_CONFIG).success).toBe(true);
  });

  test('true is accepted — the default for a new app', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.renderPrecedenceText = true;
    expect(appConfigSchema.safeParse(config).success).toBe(true);
  });

  test('it is required, with no schema default', () => {
    // A schema default would silently turn an omitted field into "on" for any config
    // assembled outside the create form - including Gali's, where it must be off.
    const config = mutableCopy(GALI_CONFIG);
    delete config.renderPrecedenceText;
    expect(appConfigSchema.safeParse(config).success).toBe(false);
  });

  test('a non-boolean is rejected', () => {
    const config = mutableCopy(GALI_CONFIG);
    config.renderPrecedenceText = 'on';
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
