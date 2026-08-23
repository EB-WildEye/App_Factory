# 0011 — Disclaimer format and storage

Status: open
Date: 2026-08-23

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

## Decision

Open. Not resolved here.

## Reasoning

Pending.

## Consequences

Pending. The `disclaimers` field is typed in `types/appConfig.ts` with an
explicit unresolved comment pointing at this ADR, per the build plan. Nothing
reads or renders it until this is settled. It also blocks whatever validation
gate "creation requirement" turns out to mean.
