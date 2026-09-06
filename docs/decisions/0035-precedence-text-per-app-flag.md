# 0035 — The precedence text is a per-app flag, and it is off for app #1

Status: accepted
Date: 2026-09-03
Supersedes: ADR-0009 Decision item 3 only. Items 1, 2, 4 and 5 of 0009 stand.

## What changed, and what caused the change

ADR 0009 decided that rules live in two lanes — binding constraints in the `_RULES`
prompt part, elaboration in `kb/` — and item 3 of its Decision said the precedence text
*"is rendered into the composed system prompt itself"*, unconditionally.

Two causes moved that, in order:

**Cause 1 — reading Gali, 2026-08-23.** Gali's prompt states the *opposite* relationship.
`_RULES` reads *"your general knowledge is a danger, not an asset"* and *"the information
that comes from the context is the truth"*, and the live template says *"answer only from
what appears in the context below"*. Retrieved material outranks the model's training
knowledge, and **nothing anywhere says a prompt rule outranks a retrieved file.** So
rendering 0009's precedence paragraph into Gali's prompt would be an unauthorised
behaviour change to a system under an ethics-committee validation freeze.

**Cause 2 — EB's decision, 2026-09-01.** The flag's home is `AppConfig`, and only
`AppConfig`.

And one constraint that arrived later and turns "off for Gali" from a choice into a
fact:

**Cause 3 — measurement, 2026-09-01.** The five-part Gali draft
(`docs/gali-five-parts-draft.md`) measures **4047 characters against a 4096 cap, leaving
49**. The precedence paragraph is roughly **200**. It does not fit. Enabling it for app #1
is not a setting change — it requires first removing about 150 characters of
clinician-authored clinical text.

| | ADR 0009 item 3 | this ADR |
| - | --------------- | -------- |
| when the text is rendered | always | only when the app's flag is on |
| app #1 | rendered | **not rendered**, by decision *and* by arithmetic |
| where the switch lives | no switch existed | `AppConfig.renderPrecedenceText`, and nowhere else |

## Decision

1. **The precedence text is rendered only when the app's flag is on.** The text itself is
   unchanged from 0009 and is not restated here — it is a named constant,
   `PROMPT_PRECEDENCE_TEXT`, exported from `lib/composeSystemPrompt.ts`.
2. **The flag is `AppConfig.renderPrecedenceText`, a required boolean.** On `AppConfig`,
   **not** on the registry row, and not on both.
3. **No schema default.** The default — on for a new app, off for Gali — belongs to the
   create form.
4. **Off for app #1.**
5. **`composeSystemPrompt` reads the flag from the config**, not from a separate argument.

## Reasoning

**Why `AppConfig` and not the registry row.** The flag changes the composed prompt, and
the composed prompt is built from `AppConfig`. A copy on the registry row could disagree
with the config that produced the prompt, and the disagreement would be invisible —
two sources of truth for a byte-level output, reconciled by nobody. The registry row
answers "which apps exist"; it is not a second configuration store.

**Why no schema default.** A default in the schema turns an *omitted* field into "on".
That is wrong for every config assembled outside the create form — a test fixture, a
migration script, an import of Gali's own configuration — and it is most wrong for
exactly the app where the flag must be off. Requiring the field means every caller states
its intent. The cost is that every fixture must set it, which is the point.

**Why the flag rather than an exception in code.** This is 0009's own reasoning and it
still holds: a hardcoded precedence paragraph would mean the generic runtime cannot host
app #1 without changing app #1. A flag records the exception as configuration, where it
is visible, greppable and per-app.

**Why the constant lives in `lib/composeSystemPrompt.ts`.** 0009 said "the strings
module", written before that module existed. `lib/uiStrings.ts` documents itself as every
Hebrew *user-facing* string; the precedence text is neither Hebrew nor user-facing — the
model reads it, the creator never sees it, and it is spent against the 4096-character
budget rather than rendered in a component. So it sits module-level beside the one
function that renders it. That is a change of location, not of answer, and it was
recorded as an amendment on 0009 before this ADR existed.

## Consequences

- Implemented: `AppConfig.renderPrecedenceText`, `z.boolean()` with no default,
  `composeSystemPrompt(config)` reading it, and tests covering both paths, the position
  of the text, and its length cost.
- **The flag is not free at the byte level.** Turning it on lengthens the composed prompt
  by the paragraph, so an app close to the cap can be pushed over it by a setting. A test
  pins that: a prompt that passes at exactly the cap with the flag off throws with it on.
- **For app #1 the flag is effectively immovable** until something else shortens.
  Recorded here so that "just turn the flag on" is never proposed as a small change.
- **Wire name is BLOCKED** — no spec artefact names this field. Q40.
- **Position within the composed prompt is BLOCKED** — 0009 required the text but never
  said where it goes. Currently immediately after `rules`, isolated in one line. Q6.
- **Language is BLOCKED** — the text is in 0009's English wording while every app so far
  is Hebrew RTL. An English paragraph in a Hebrew prompt is itself a behaviour change.
  Q6.
- If the contested 4096 cap turns out to be **4000** (Q43), the arithmetic above gets
  worse, not better: the five-part draft would already be over before the flag is
  considered.
- 0009 keeps its text and its two amendments. Removing them would falsify the record of
  what that file said and when.
