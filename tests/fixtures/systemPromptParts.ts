/**
 * Synthetic five-part prompt fixtures.
 *
 * ADR 0039. Before the purge these tests used Gali's real parts as their fixture data,
 * which meant the clinical text was committed twice — once as a constant and once as a
 * test dependency. Nothing any of those tests asserted needed the real bytes: they
 * check ordering, mapping, and the length cap, and a synthetic part exercises all
 * three.
 *
 * Everything here is deliberately obvious nonsense. If one of these strings ever
 * appears in a UI, a wire payload or a provisioned resource, it should be recognisable
 * on sight as a fixture that escaped.
 */

import type { AppConfigSystemPrompt } from '@/types/appConfig';
import { BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT } from '@/lib/gali/constants';

/**
 * A realistic-shaped config: five distinguishable parts, a two-item rule list, and a
 * composed length comfortably under the cap.
 *
 * The parts carry their own trailing blank lines, because the separator between parts
 * is the empty string — that spacing convention is Gali's and the fixture has to honour
 * it or it would not exercise the same join.
 */
export const FIXTURE_SYSTEM_PROMPT_PARTS: AppConfigSystemPrompt = {
  identity: 'FIXTURE identity: who this assistant is.\n\n',
  language: 'FIXTURE language: answer in the language you were asked in.\n\n',
  voice: 'FIXTURE voice: direct, warm, never performative.\n\n',
  rules: [
    'FIXTURE rule one: answer only from the supplied context.',
    'FIXTURE rule two: never state a dose.',
  ],
  formatAndFlags: 'FIXTURE format: escalate on a red flag, disclaim once.\n',
};

/**
 * The five parts as a plain record, for tests that map part names rather than compose
 * them. `rules` is a single string here, which is the shape the wire and the Gali
 * source both use — the list is a factory-side authoring convenience (ADR 0009).
 */
export const FIXTURE_PROMPT_PART_TEXT = {
  identity: FIXTURE_SYSTEM_PROMPT_PARTS.identity,
  language: FIXTURE_SYSTEM_PROMPT_PARTS.language,
  voice: FIXTURE_SYSTEM_PROMPT_PARTS.voice,
  rules: 'FIXTURE rule: a single authored string, the way Gali authored its own.\n\n',
  formatAndFlags: FIXTURE_SYSTEM_PROMPT_PARTS.formatAndFlags,
} as const;

/** A one-item rule list, which is how a single authored `_RULES` survives the list type. */
export const FIXTURE_SINGLE_RULE_PARTS: AppConfigSystemPrompt = {
  ...FIXTURE_SYSTEM_PROMPT_PARTS,
  rules: [FIXTURE_PROMPT_PART_TEXT.rules],
};

/** Built by repetition rather than written out, so the file stays readable. */
function filler(label: string, characters: number): string {
  const unit = `${label} `;
  return unit.repeat(Math.ceil(characters / unit.length)).slice(0, characters);
}

/**
 * Parts whose composition exceeds the Bedrock cap, for the tests that prove
 * `composeSystemPrompt` refuses rather than truncates.
 *
 * Sized as a multiple of the cap so the test does not depend on the exact number: what
 * matters is "well over", the same way Gali's own five parts are well over.
 */
export const FIXTURE_OVERSIZED_PARTS: AppConfigSystemPrompt = {
  identity: filler('IDENTITY', BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT),
  language: filler('LANGUAGE', BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT),
  voice: filler('VOICE', BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT),
  rules: [filler('RULES', BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT)],
  formatAndFlags: filler('FORMAT', BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT),
};
