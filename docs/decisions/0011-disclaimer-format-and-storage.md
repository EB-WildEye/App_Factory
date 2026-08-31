# 0011 — Disclaimer format and storage

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-23
Recommendation added: 2026-08-31

## Context

Marked TBD by the spec, in the Open section: *"Disclaimers — a creation
requirement in the data center. Format and where they are stored."*

That single line is everything the spec says. Disclaimers appear in no JSON
sample, no flow step, and no resource card. The build plan nonetheless requires
the field to exist in the type: *"`disclaimers` — TBD in the spec; type the
field, comment it as unresolved."*

Two things are undecided and they are independent:

**Format.** One string? A list of strings? A structured object with a
`whenShown` condition per entry? Localised per language?

**Storage.** The candidates each carry a different update path, which is the
real consequence:

- A **markdown file in the bucket** — editable and re-embeddable through the
  Data Center like any other knowledge file, but then it is also *retrievable*,
  and the model may quote it as content rather than the UI displaying it.
- A **field in `AppConfig`**, rendered into `_FORMAT_AND_FLAGS` or another SP
  part — then it is prompt text, and changing it means recomposing the prompt,
  which the spec's principle says content fixes must not do.
- A **field on the registry row** — read by the UI at render time, changed
  without touching the bucket or the prompt, but then the registry table holds
  content, which is a role it does not have anywhere else in the spec.
- A **file outside `kb/`** in the app bucket, e.g. `legal/disclaimers.md` —
  editable through the Data Center, not ingested because the Data Source points
  only at `kb/`. This is the option that keeps every other rule intact.

Also open: the spec calls it a *"creation requirement in the data center"*, which
places it in the Data Center, while creation happens in the Admin Dashboard's
create form. Which surface collects it, and does a missing disclaimer block
creation?

## Options considered

See the storage candidates above; each pairs with any format choice. The
question to settle first is **whether a disclaimer is retrievable content, prompt
text, or UI chrome** — the storage location follows from that, and the format
follows from the storage.

## Recommendation

**Apply the 0009 placement test, because Gali already does both lanes and the two
lanes hold different things.** Read on 2026-08-30:

- **Prompt lane.** `_FORMAT_AND_FLAGS` carries a *frequency rule*, not a
  disclaimer text alone: the default disclaimer appears **once**, in the first
  informative answer of a conversation, and never again; special disclaimers (red
  flag, orange flag, out-of-scope) may repeat whenever the situation recurs; every
  disclaimer is visually separated by a blank line
  (`shared/shared/prompt.py:273-287`). The condensed live template repeats the
  once-only rule (`:372-376`), and the runtime injects a
  `[SHOW_DEFAULT_DISCLAIMER]` marker into the query on the second turn to enforce
  it (`functions/chat/app.py:440-441`).
- **KB lane.** `data/Disclaimers 210626.md` is an ingested document with
  `doc_id="disclaimers"` and `doc_type="disclaimer_policy"`
  (`scripts/ingest_kb.py:108-116`).

So the answer to *"is a disclaimer retrievable content, prompt text, or UI
chrome"* is that Gali treats it as the first two, and never as UI chrome. The
model emits it inside its answer; the UI does not render a banner.

Recommendation:

1. **A disclaimer is a prompt-part concern, and `disclaimers` is not a separate
   storage location.** The binding part — the text and *when it appears* — belongs
   in `_FORMAT_AND_FLAGS`, exactly where Gali has it. Elaboration and policy
   background belong in `kb/`, like any other elaboration (0009's split, applied
   unchanged).
2. **Format: a list of `{ text, whenShown }`,** because the frequency rule is the
   load-bearing half. A bare string cannot express "once per conversation" versus
   "every time the situation recurs", and that distinction is the difference
   between a legally sufficient disclaimer and a disclaimer the model repeats
   until the patient stops reading it.
3. **Storage: `AppConfig`, rendered into the prompt at compose time.** Not the
   registry row (the registry holds no content anywhere else), not a `legal/`
   file (nothing would read it), not a `kb/` file (then the model can quote it as
   *content*, which is how a disclaimer becomes an answer).
4. **Collected in the create form, not the Data Center.** The spec calls it a
   *"creation requirement in the data center"*, but creation happens in the Admin
   Dashboard, and a config field that blocks creation has to be collected where
   creation happens. Recommend it **does** block creation: an app that can give
   medical information without a disclaimer should not be creatable.

Cost to be aware of: rendering disclaimers into the prompt means a disclaimer edit
is a prompt recomposition, which the spec's *"fix content in the file, never patch
the prompt"* principle discourages — and it spends characters against the 4096 cap
(0016). Gali's own disclaimer text is roughly 200 characters of a 4064-character
template. That cost is real and it is the reason this is a decision rather than an
obvious call.

## Decision

Open — DRAFT. Awaiting EB. Disclaimer wording and frequency are clinical and legal
questions; this recommendation is only about where the field lives.

## Consequences

The `disclaimers` field is typed in `types/appConfig.ts` with an
explicit unresolved comment pointing at this ADR, per the build plan. Nothing
reads or renders it until this is settled. It also blocks whatever validation
gate "creation requirement" turns out to mean.
