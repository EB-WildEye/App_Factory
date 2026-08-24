# 0016 — The composed prompt has a hard length cap

Status: accepted
Date: 2026-08-24

## Context

Bedrock's `RetrieveAndGenerate` caps the `textPromptTemplate` at **4096
characters** and requires it to contain the `$search_results$` placeholder. This
is a service limit, not a style preference: over the cap the API rejects the
call, so the app does not degrade, it fails.

Gali treats it as load-bearing. `shared/shared/prompt.py:409-416` asserts both
conditions **at import time**, with the comment that a bad edit must not be able
to ship to Lambda and break `/chat` at runtime. And `functions/chat/app.py:286`
explains why per-turn directives are appended to the RAG *query* rather than the
prompt template: the template is *"clinician-vetted and near its char cap."*
Gali's engineering has already been shaped around this number.

The factory has no such gate. `AppConfig` collects five creator-authored prompt
parts of unbounded length, the zod schema validates their presence and not their
size, and `composeSystemPrompt` concatenates whatever it is given. So a
schema-valid `AppConfig` can produce a prompt that Bedrock refuses — and nothing
in `docs/app-factory-architecture.html`, in the build plan, or in any other ADR
mentions the limit. It reaches the checklist for the first time with this ADR.

The failure mode this creates is specific: the creator fills in five textareas,
the form validates, the app is created, seven provisioning steps run, and the
first chat request fails. The cost of the missing gate is paid at the far end of
the sequence from where the mistake was made.

## Options considered

1. **Validate and fail.** `composeSystemPrompt` measures the composed string and
   refuses above the cap; the create form shows a live count and blocks save.
2. **Truncate to fit.** Compose, then cut at 4096.
3. **Warn only.** Show the count, let the creator save over the cap, fail later.
4. **No gate.** Discover it when the first chat request fails.

## Decision

Option 1.

- The cap is a **hard constraint on the composed prompt: 4096 characters.**
- `composeSystemPrompt` **validates total length and fails above it. It never
  silently truncates.**
- The create form shows a **live character count against 4096** and **blocks save
  above it.**
- This is a **Milestone 1 UI requirement**, recorded in the checklist as `U16`.

## Reasoning

Truncation is the dangerous option, and it is dangerous in a way that is easy to
miss. The join order is fixed — identity, language, voice, rules, format and
flags — so the text a truncation removes is always the *tail*, and the tail is
`_FORMAT_AND_FLAGS`. In Gali that part carries the disclaimer rules and the flag
definitions. Cutting the end of the prompt therefore removes precisely the
safety-bearing instructions, quietly, while leaving a prompt that looks complete
and runs fine. A hard failure is louder and cheaper than an app that answers
without a disclaimer.

Warning without blocking moves the failure to provisioning time, after the
creator has left the form and lost the context needed to fix it. Discovering it
at first-chat time is worse again: by then the bucket, the KB, the table and the
registry row all exist, which is the orphan problem in 0013 arriving through a
new door.

The gate belongs in both places, and for different reasons. In
`composeSystemPrompt` because that function is the single source of the joined
string and a constraint on the string belongs with the code that produces it — it
also covers every future caller, not just the form. In the form because a
character count is only useful while the creator is still typing; a count shown
after save is a post-mortem.

## Consequences

- **`composeSystemPrompt` stops being a total function.** Its signature must
  express failure — it cannot return a bare `string` for all inputs. Whether that
  is a thrown error or a result type is a code-level choice, not an ADR one.
- The cap is measured in **characters** of the **composed output**, not tokens,
  not bytes, and not the sum of the parts measured separately.
- **0009 spends part of the budget.** The precedence text is rendered into the
  composed prompt when an app's flag is on, so the space available for
  creator-authored text is 4096 minus that text. The count shown in the form must
  reflect the composed total, including the precedence text, not just what the
  creator typed.
- `4096` is a named constant in one module, per the code conventions. Nothing
  else in the codebase carries the number.
- The zod schema cannot enforce this on its own: the limit is on the *composition*
  of five fields, not on any one field, so it is a cross-field rule.
- **Gali's own headroom is unknown.** Its live template is described as near the
  cap but the exact length was not measured — that requires executing
  `prompt.py`, which was not done during a read-only pass. Until it is measured,
  no claim should be made that a generic addition fits.
- Still open, and this ADR does not settle it: whether the cap applies to the
  five-part composition or to a separately authored condensed template. That is
  checklist `S9` — Gali's live prompt is not its five-part composition, so the
  thing being capped may not be the thing the factory produces.
