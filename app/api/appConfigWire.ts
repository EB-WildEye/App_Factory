/**
 * The one place a field name changes form.
 *
 * ADR 0008: `camelCase` in TypeScript, `snake_case` on the wire, and exactly one
 * mapper, inside the route handlers. A conversion in a component, a hook, or
 * `services/factoryApi.ts` is a bug. This module is that mapper.
 *
 * It is deliberately dumb. No validation (the zod schema does that), no defaults, no
 * business logic — a rename and nothing else.
 */

import type { AppConfig, AppConfigSystemPrompt } from '@/types/appConfig';

/**
 * The five parts as the provisioning service receives them. The keys are the spec's
 * own `sp_sections` names, which is why they are neither `camelCase` nor `snake_case`.
 *
 * `_RULES` is an array here. The spec's F2 example is literally
 * `"_RULES": ["rule_01", ...]`, and that is the only concrete evidence of the wire
 * shape; ADR 0009 settles that rules are authored as a list without saying whether
 * the list or the joined string crosses the boundary. QUEUED — the list is carried
 * through unjoined rather than joined here, so the join stays in
 * `lib/composeSystemPrompt.ts` alone.
 */
export interface WireSystemPromptSections {
  readonly _IDENTITY: string;
  readonly _LANGUAGE: string;
  readonly _VOICE: string;
  readonly _RULES: readonly string[];
  readonly _FORMAT_AND_FLAGS: string;
}

/**
 * The request body `POST /apps` receives.
 *
 * Two fields of `AppConfig` have no representation here yet:
 *
 * - `dataFiles` maps to `data_sections`, whose element shape is BLOCKED BY ADR-0010.
 *   Typed as an empty list, which is the only value `AppConfig.dataFiles` can hold.
 * - `disclaimers` has **no wire name at all** — it appears in no spec JSON, and
 *   ADR-0011 has not placed it. It is therefore absent from this type rather than
 *   given an invented key.
 */
export interface WireAppConfig {
  readonly app_name: string;
  readonly ui_template: string;
  readonly sp_sections: WireSystemPromptSections;
  readonly data_sections: readonly never[];
}

function toWireSystemPromptSections(
  systemPrompt: AppConfigSystemPrompt,
): WireSystemPromptSections {
  return {
    _IDENTITY: systemPrompt.identity,
    _LANGUAGE: systemPrompt.language,
    _VOICE: systemPrompt.voice,
    _RULES: systemPrompt.rules,
    _FORMAT_AND_FLAGS: systemPrompt.formatAndFlags,
  };
}

/** Serialize a validated `AppConfig` into the body the provisioning service consumes. */
export function toWireAppConfig(config: AppConfig): WireAppConfig {
  return {
    app_name: config.appName,
    ui_template: config.uiTemplate,
    sp_sections: toWireSystemPromptSections(config.systemPrompt),
    data_sections: config.dataFiles,
  };
}
