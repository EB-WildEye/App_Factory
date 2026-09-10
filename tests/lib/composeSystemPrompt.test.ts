/**
 * `composeSystemPrompt` — the only place the five parts are joined.
 *
 * What is being defended here: the cap fails instead of truncating (ADR 0016), the
 * precedence flag is a real switch and not a constant (ADR 0009 as amended), and the
 * order and separator are Gali's, so app #1 composes to the bytes it runs today.
 */

import { describe, expect, test } from 'bun:test';

import {
  ComposedPromptTooLongError,
  PROMPT_PRECEDENCE_TEXT,
  RULES_ITEM_SEPARATOR,
  composeSystemPrompt,
} from '@/lib/composeSystemPrompt';
import {
  BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT,
  GALI_SYSTEM_PROMPT_SEPARATOR,
} from '@/lib/gali/constants';
import {
  FIXTURE_OVERSIZED_PARTS,
  FIXTURE_PROMPT_PART_TEXT,
  FIXTURE_SINGLE_RULE_PARTS,
} from '@/tests/fixtures/systemPromptParts';
import type { AppConfigSystemPrompt } from '@/types/appConfig';

/** Short, distinguishable parts, so an ordering bug shows up as a wrong string. */
const SMALL_PARTS: AppConfigSystemPrompt = {
  identity: 'I.',
  language: 'L.',
  voice: 'V.',
  rules: ['R1.', 'R2.'],
  formatAndFlags: 'F.',
};

function partsOfLength(total: number): AppConfigSystemPrompt {
  return {
    identity: 'a'.repeat(total),
    language: '',
    voice: '',
    rules: [],
    formatAndFlags: '',
  };
}

/** Compose and return the error, narrowed. Fails the test if nothing was thrown. */
function composeExpectingTooLong(
  parts: AppConfigSystemPrompt,
  renderPrecedenceText: boolean,
): ComposedPromptTooLongError {
  try {
    composeSystemPrompt({ systemPrompt: parts, renderPrecedenceText });
  } catch (error) {
    if (error instanceof ComposedPromptTooLongError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected composeSystemPrompt to throw ComposedPromptTooLongError');
}

describe('composeSystemPrompt — join order and separator', () => {
  test('the five parts join in the fixed order with no separator', () => {
    expect(composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: false })).toBe(
      `I.L.V.R1.${RULES_ITEM_SEPARATOR}R2.F.`,
    );
  });

  test('the separator between parts is the empty string', () => {
    expect(GALI_SYSTEM_PROMPT_SEPARATOR).toBe('');
  });

  test('rules are joined with the rule separator, in authored order', () => {
    const composed = composeSystemPrompt({
      systemPrompt: { ...SMALL_PARTS, rules: ['first', 'second', 'third'] },
      renderPrecedenceText: false,
    });
    const joined = ['first', 'second', 'third'].join(RULES_ITEM_SEPARATOR);
    expect(composed).toBe(`I.L.V.${joined}F.`);
  });

  test('a one-item rule list is byte-identical to the authored string', () => {
    // This is what lets a single authored _RULES — which is how app #1 wrote it —
    // survive the list type without gaining a separator.
    expect([FIXTURE_PROMPT_PART_TEXT.rules].join(RULES_ITEM_SEPARATOR)).toBe(
      FIXTURE_PROMPT_PART_TEXT.rules,
    );
    expect(FIXTURE_SINGLE_RULE_PARTS.rules).toHaveLength(1);
  });
});

describe('composeSystemPrompt — the precedence flag (ADR 0009 as amended)', () => {
  test('flag on renders the precedence text', () => {
    const composed = composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: true });
    expect(composed).toContain(PROMPT_PRECEDENCE_TEXT);
  });

  test('flag on places the precedence text after the rules and before the format part', () => {
    expect(composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: true })).toBe(
      `I.L.V.R1.${RULES_ITEM_SEPARATOR}R2.${PROMPT_PRECEDENCE_TEXT}F.`,
    );
  });

  test('flag off omits it entirely — this is the Gali case', () => {
    const composed = composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: false });
    expect(composed).not.toContain(PROMPT_PRECEDENCE_TEXT);
    expect(composed).not.toContain('the prompt rule governs');
  });

  test('the flag changes the composed length, so it spends part of the 4096 budget', () => {
    const off = composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: false });
    const on = composeSystemPrompt({ systemPrompt: SMALL_PARTS, renderPrecedenceText: true });
    expect(on.length).toBe(off.length + PROMPT_PRECEDENCE_TEXT.length);
  });
});

describe('composeSystemPrompt — the 4096 cap (ADR 0016)', () => {
  test('exactly at the limit is allowed', () => {
    const composed = composeSystemPrompt({
      systemPrompt: partsOfLength(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT),
      renderPrecedenceText: false,
    });
    expect(composed.length).toBe(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
  });

  test('one character over the limit throws', () => {
    expect(() =>
      composeSystemPrompt({
        systemPrompt: partsOfLength(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT + 1),
        renderPrecedenceText: false,
      }),
    ).toThrow(ComposedPromptTooLongError);
  });

  test('the error carries the composed length and the limit, and says it did not truncate', () => {
    const failure = composeExpectingTooLong(partsOfLength(5000), false);
    expect(failure.composedLength).toBe(5000);
    expect(failure.limit).toBe(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
    expect(failure.message).toContain('not truncated');
  });

  test('the precedence text alone can push a passing prompt over the cap', () => {
    const parts = partsOfLength(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
    expect(() =>
      composeSystemPrompt({ systemPrompt: parts, renderPrecedenceText: false }),
    ).not.toThrow();
    expect(() =>
      composeSystemPrompt({ systemPrompt: parts, renderPrecedenceText: true }),
    ).toThrow(
      ComposedPromptTooLongError,
    );
  });
});

describe('composeSystemPrompt — five real-sized parts', () => {
  test('five parts that each nearly fill the cap are refused, not truncated', () => {
    // The shape of the I7 finding and the evidence for draft ADR 0018: five separately
    // authored parts can each look reasonable and still compose to something no
    // service will accept. Asserted here against a synthetic set — the same property
    // against app #1's actual parts lives in tests/gali/productionSource.test.ts,
    // which reads the gitignored source and skips without it (ADR 0039).
    const failure = composeExpectingTooLong(FIXTURE_OVERSIZED_PARTS, false);
    expect(failure.composedLength).toBeGreaterThan(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT * 4);
    expect(failure.limit).toBe(BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT);
  });

  test('the composed length is exactly the sum of the parts, so the join adds nothing', () => {
    // A join that introduced a separator of its own would show up here as a surplus.
    const parts = FIXTURE_OVERSIZED_PARTS;
    const expected =
      parts.identity.length +
      parts.language.length +
      parts.voice.length +
      parts.rules.join(RULES_ITEM_SEPARATOR).length +
      parts.formatAndFlags.length;
    expect(composeExpectingTooLong(parts, false).composedLength).toBe(expected);
  });
});
