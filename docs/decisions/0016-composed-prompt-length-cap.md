# 0016 — The composed prompt has a hard length cap

Status: accepted
Date: 2026-08-24
**Contested 2026-09-01 — the number is not corroborated. See the note below before
relying on 4096.**

## Note, 2026-09-01 — the three authorities disagree

The cap this ADR is built on has three sources and no two of them agree.

| source | says | evidence |
| ------ | ---- | -------- |
| Gali's code | **4096** | `shared/shared/prompt.py:409` asserts `len(...) <= 4096` at import time |
| the AWS API model | **4000** | `bedrock-agent-runtime` `2023-07-26`: shape `TextPromptTemplate` declares `min 1, max 4000` |
| production behaviour | **at least 4064** | Gali's live template is 4064 characters and `/chat` works |

The path was traced rather than assumed. The member Gali passes —
`retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.generationConfiguration.promptTemplate.textPromptTemplate`
— resolves to `TextPromptTemplate`, max **4000**. The other template shape in the same
model, `BasePromptTemplate`, does allow 100000, but it is referenced only by
`PromptConfiguration.basePromptTemplate`, which is the agent-orchestration path and not
this call. So the 4000 is the declared limit for exactly the field Gali uses.

**What that means concretely:** Gali's live template is **64 characters over** the
declared maximum and works anyway, and the five-part draft in
`docs/gali-five-parts-draft.md` at 4047 is **47 over**. botocore does not enforce
string maxima client-side, so the request is sent and the service accepts it — which
means either the model's 4000 is stale, or the limit is documented but unenforced.

**Nothing has been changed on the strength of this.** The constant stays 4096 in
`lib/gali/constants.ts`, because that file records what Gali asserts and is generated
from Gali's source; silently lowering it would assert a number that production
contradicts, and silently raising the model's number would assert one AWS denies.

What this does change is confidence: **this ADR's headroom arithmetic is only as good
as its cap.** If the real limit is 4000, then app #1 is over it, the 32-character
headroom this ADR relies on is actually a 64-character overrun, and the ADR 0009
precedence flag is not merely tight for Gali but impossible. Queued as **Q43**, with
the one experiment that would settle it named there.

Credit where due: the discrepancy was surfaced by the parallel production
investigation, `docs/gali_readonly_audit_2026-09-01.md`, and verified independently
here against the service model.

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
