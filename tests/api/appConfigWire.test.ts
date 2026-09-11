/**
 * The one mapper (ADR 0008). What matters is that every field crosses, that it
 * crosses under its wire name, and that the mapper changes nothing else — a
 * serializer that quietly joins, defaults or reorders is a serializer that makes the
 * request body a second contract.
 */

import { describe, expect, test } from 'bun:test';

import { toWireAppConfig } from '@/app/api/appConfigWire';
import { FIXTURE_PROMPT_PART_TEXT } from '@/tests/fixtures/systemPromptParts';
import type { AppConfig } from '@/types/appConfig';

const CONFIG: AppConfig = {
  appName: 'gali',
  uiTemplate: 'clinic-rtl',
  colourScheme: { kind: 'preset', presetId: 'gali-sage' },
  renderPrecedenceText: false,
  digestRecipientEmail: 'gynecology-digest@wolfson.example.gov.il',
  systemPrompt: {
    identity: FIXTURE_PROMPT_PART_TEXT.identity,
    language: FIXTURE_PROMPT_PART_TEXT.language,
    voice: FIXTURE_PROMPT_PART_TEXT.voice,
    rules: [FIXTURE_PROMPT_PART_TEXT.rules],
    formatAndFlags: FIXTURE_PROMPT_PART_TEXT.formatAndFlags,
  },
  dataFiles: [],
  disclaimers: [],
};

describe('toWireAppConfig', () => {
  test('renames the top-level fields to the wire names', () => {
    const wire = toWireAppConfig(CONFIG);
    expect(wire.app_name).toBe('gali');
    expect(wire.ui_template).toBe('clinic-rtl');
  });

  test('maps the five parts into sp_sections under the spec names', () => {
    const wire = toWireAppConfig(CONFIG);
    expect(Object.keys(wire.sp_sections)).toEqual([
      '_IDENTITY',
      '_LANGUAGE',
      '_VOICE',
      '_RULES',
      '_FORMAT_AND_FLAGS',
    ]);
  });

  test('carries the prompt text through byte for byte', () => {
    const wire = toWireAppConfig(CONFIG);
    expect(wire.sp_sections._IDENTITY).toBe(FIXTURE_PROMPT_PART_TEXT.identity);
    expect(wire.sp_sections._LANGUAGE).toBe(FIXTURE_PROMPT_PART_TEXT.language);
    expect(wire.sp_sections._VOICE).toBe(FIXTURE_PROMPT_PART_TEXT.voice);
    expect(wire.sp_sections._FORMAT_AND_FLAGS).toBe(
      FIXTURE_PROMPT_PART_TEXT.formatAndFlags,
    );
  });

  test('_RULES crosses as the authored list, unjoined', () => {
    // The join belongs to lib/composeSystemPrompt.ts alone. QUEUED: whether the wire
    // carries the list or the joined string is not settled by any ADR.
    const wire = toWireAppConfig({
      ...CONFIG,
      systemPrompt: { ...CONFIG.systemPrompt, rules: ['one', 'two'] },
    });
    expect(wire.sp_sections._RULES).toEqual(['one', 'two']);
  });

  test('dataFiles crosses as data_sections', () => {
    expect(toWireAppConfig(CONFIG).data_sections).toEqual([]);
  });

  test('the body carries exactly the four fields that have a wire name', () => {
    // disclaimers is absent on purpose: it has no wire name in any spec JSON and
    // ADR-0011 has not placed it. An invented key would become the contract.
    expect(Object.keys(toWireAppConfig(CONFIG))).toEqual([
      'app_name',
      'ui_template',
      'sp_sections',
      'data_sections',
    ]);
  });
});
