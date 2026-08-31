# 0018 — Gali: exception, or migration to what the factory produces

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

## Context

The milestone's definition of done is that **generic-Gali, given Gali's own
config, reproduces today's Gali exactly.** Reading both Gali repos (recorded in
`docs/gali-ground-truth.md`) shows three places where that is not currently
possible, because the architecture spec describes a mechanism app #1 does not
use. They are one decision, not three, because they all ask the same thing: is
Gali the reference implementation of the factory's contract, or is Gali a special
case the factory has to tolerate?

### The three mismatches

**1. The prompt (checklist `S9`).** The spec's central claim is that the system
prompt is *assembled, not written*: five named parts, joined in a fixed order,
saved as `prompt/v1.txt`. Gali has those five parts — and does not send them.

| | value | provenance |
| - | ----- | ---------- |
| what production sends | `RAG_PROMPT_TEMPLATE`, hand-written and condensed, **4064 chars** | `shared/shared/prompt.py:300-380`, sent at `functions/chat/app.py:127` |
| headroom to the Bedrock cap | **32 characters** | 4096 − 4064 |
| the five parts composed | **11,492 chars**, 2.81x the cap | `shared/shared/prompt.py:293` |
| what the five parts are for | *"Full prompt (reference / documentation)"* | `shared/shared/prompt.py:6` |
| versioned prompt artefact | none. The prompt is a Python literal in a Lambda layer, versioned by git | — |

The composed five-part prompt is not merely different from the live prompt. **It
cannot be sent at all** — it is nearly three times the hard service limit. The
factory's own `composeSystemPrompt` refuses it, and there is a test asserting
exactly that (`tests/lib/composeSystemPrompt.test.ts`). So "the factory composes
Gali's prompt" is not a small piece of work; it means authoring a sixth artefact
that is neither the five parts nor today's template.

Per-turn behaviour compounds it. Gali steers each turn with directives appended
to the RAG *query* — `_CLARIFY_ER_DIRECTIVE`, `_ORANGE_DIRECTIVE`,
`_ANTILEAK_DIRECTIVE`, `[SHOW_DEFAULT_DISCLAIMER]` — precisely because the
template has 32 characters left (`functions/chat/app.py:286-289, 429-441`). None
of that exists in the spec, the build plan, or `AppConfig`.

**2. The data source (checklist `R5`, `R6`).** The spec says the Data Source
points at `s3://<app>/kb/`. Gali's KB uses a **CUSTOM** data source and pushes
markdown with `IngestKnowledgeBaseDocuments`, a per-document upsert keyed on
document id (`scripts/ingest_kb.py:2-8, 217-252`). The bucket in the stack is
`gali-documents-${AWS::StackName}-${AWS::AccountId}` and the watched prefix is
`documents/`, not `kb/` (`template.yaml:112, 270`). There is no `prompt/` prefix.
This mismatch is the *reason* per-file re-embedding (`E8`) is feasible at all, so
it is not purely a cost.

**3. The chat table (checklist `R7`).** Spec: name `<app>-chat`, key `session_id`,
TTL attribute `expires_at`, rolling 24h. Gali: name `gali-sessions-${Stage}`,
**composite** key `session_id` HASH + `timestamp` RANGE, TTL attribute **`ttl`**,
expiring at the **next midnight Asia/Jerusalem** (`template.yaml:87-105`,
`shared/shared/history.py:87-91`). Sort key `timestamp = 0` is reserved for the
Bedrock session pointer, so the sort key is not a free timestamp field.

### Why this is a decision and not a bug list

ADR 0009's 2026-08-24 amendment already answered a smaller version of this
question and answered it in one direction: the precedence text became **a per-app
flag, default on for new apps, off for Gali**, on the stated grounds that adding
it to Gali's prompt is *"an unauthorised behaviour change against a validated
system"* under an ethics-committee freeze. That is app #1 being made an exception
by configuration. Whether that precedent generalises to the prompt, the data
source and the table is what this ADR is for.

Gali is also under a validation freeze with a 380-question validation set. Any
change to what reaches the model is a re-validation event with a clinician and a
committee attached, not a deploy.

## Options considered

### A — Gali stays as it is; the factory composes only for new apps

App #1 keeps its hand-written template, its CUSTOM data source and its existing
table. The factory's composition path, `kb/` layout and `<app>-chat` table are
for apps #2 onward. Gali becomes a **migration project with its own validation
run**, scheduled separately, or never.

- The freeze is respected by construction. Nothing that reaches a patient changes.
- The factory ships without waiting on a clinical re-validation.
- Cost: "generic-Gali reproduces Gali" becomes false as a *runtime* claim and
  survives only as a *configuration* claim. The registry would hold a row for an
  app whose resources the factory did not create and does not match, so the Data
  Center and the Admin list have to tolerate a shape they cannot reproduce.
- Cost: two provisioning paths eventually exist in the same codebase, and the
  spec's principle — *a content fix is made in the file and re-ingested, never
  patched into a prompt* — stays untrue for app #1.

### B — The factory composes Gali's prompt too, byte-identical before anything ships

The factory's output for Gali must equal today's artefacts exactly: the composed
prompt is byte-identical to `RAG_PROMPT_TEMPLATE`, the data source is CUSTOM, and
the table keeps its composite key and `ttl`.

- The definition of done stays literally true, and it becomes testable: one golden
  test comparing the factory's output to a 4064-character constant already in the
  repo.
- Cost: the five-part model has to be abandoned or redefined for Gali, because
  five parts totalling 11,492 characters cannot compose to a 4064-character
  string. Either the parts stop being the source of the live prompt, or Gali's
  parts get rewritten — and rewriting them is a re-validation event.
- Cost: the factory has to model a CUSTOM data source and a composite-key table,
  which means `AppConfig` grows fields the spec does not have, and the spec's
  fixed values (`kb/` prefix, `<app>-chat`, `expires_at`) become wrong rather than
  merely unused.
- Cost: the per-turn directives have to be reproduced somewhere, or Gali on the
  generic runtime behaves differently from Gali today even with an identical
  prompt.

### C — Split the claim: byte-identical where it is cheap, exception where it is not

Not one of the two options asked for, recorded because the evidence suggests it.
Reproduce the **table and the data source** exactly (both are configuration, both
are provisioning-time, neither touches what the model reads) and treat **the
prompt** as the exception, per the 0009 precedent.

- The two mismatches with no clinical content get fixed; the one with clinical
  content stays frozen.
- Cost: the definition of done needs restating as "reproduces Gali's resources
  exactly; app #1's prompt is imported, not composed", which is a weaker claim
  that has to be written down or it will be forgotten.

## Recommendation

**None. This one is not the agent's to pick, and the handoff says so.**

What can be said without picking:

- The prompt half of option B is much more expensive than it looks. It is not a
  formatting exercise; it requires authoring a third prompt artefact and a
  clinician re-validation of a frozen system.
- The table and data-source halves are cheap by comparison. Nothing about a TTL
  attribute name or a data source type reaches a patient.
- Doing nothing has a real cost too: every downstream ADR that says "the spec
  fixes this value" is quietly conditional on this decision.

What would settle it: whether a re-validation run of the 380-question set is on
the table in this milestone at all. If it is not, option A or C follows; if it is,
B becomes arguable.

## Consequences

Recorded for whichever option is taken.

- **If A:** the registry row needs a field distinguishing a factory-provisioned
  app from an imported one, which is new work for 0007 and for the Admin list
  (`U6`). Checklist `S9`, `R5`, `R6`, `R7` are closed as "spec describes apps #2+".
- **If B:** ADR 0016's cap becomes a *design* constraint on the five parts, not
  just a validation, and the create form needs a mode where the composed prompt is
  imported rather than authored. `AppConfig` grows data-source-type and key-schema
  fields.
- **If C:** the definition of done is restated in `CLAUDE.md`, and `S9` alone stays
  open.
- Either way, the four checklist rows stop being informational and become settled,
  and the nine "not found" items in `docs/gali-ground-truth.md` — chunking,
  embeddings, vector store — become blocking for option B and merely open for A.
- ADR 0009's per-app precedence flag is unaffected: it is already a flag, and a
  flag is compatible with every option here.
