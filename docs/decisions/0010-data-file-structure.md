# 0010 — Data file structure a creator must supply

Status: open
Date: 2026-08-23

## Context

Marked TBD by the spec, in the Open section: *"The data file — which structure
the creator must supply before an app can be created."*

What the spec does say:

- **F3**: *"Data goes in through the UI in a defined structure, not as free
  text. Each section here becomes one markdown file later — which is what makes
  editing and re-embedding a single file possible."* Shape shown:
  `{ id, title, body_md }`, with example ids `prep`, `aftercare`, `red_flags`,
  23 sections in the illustration.
- **B2**: each section becomes one file under `kb/`, e.g. `kb/prep.md`.
- **Data Center card**: *"Create a new file through a set of structural rules,
  not free text."*
- The build plan, Prompt 3: *"New file — built from a rule-based structure, NOT a
  free-text editor. The structure rules are TBD in the spec. Build screens 1 and
  2, then stop and ask me for the rules before starting screen 3."*

So the question is asked twice — once for the create form (F3, how a creator
supplies the initial knowledge base) and once for the Data Center (adding a file
to an app that already exists). They may or may not be the same rules.

What is undefined:

- The required sections. Is there a fixed list every app must supply (`prep`,
  `aftercare`, `red_flags`, …), a minimum count, or none?
- The structure *within* `body_md`. "Not free text" implies constrained fields
  that render to markdown — but which fields, and are they the same for every
  section type?
- Whether `id` is creator-supplied or derived from `title`, and what it is
  validated against, given it becomes an S3 key.
- Whether `title` survives into the file as a heading or is metadata only.
- What blocks creation: the spec says a structure is required *"before an app can
  be created"*, so this is a validation gate on the create form, not advice.

## Options considered

Not enumerable yet — the rules are content decisions, not technical ones. The
axes that need answers:

1. **Fixed section list** vs **creator-defined sections** vs **fixed core plus
   optional extras**.
2. **Per-section field template** (each section is a form) vs **markdown with a
   validated skeleton** (required headings, checked on save) vs **free markdown
   with only `id` and `title` constrained**.
3. **Same rules for create-form sections and Data-Center new files**, or two
   different structures.

## Decision

Open. Not resolved here.

## Reasoning

Pending.

## Consequences

Pending. Per the build plan this blocks **Data Center screen 3 only** — screens
1 (file list) and 2 (edit, save, re-embed one file) are built first and do not
depend on it. It also blocks the data-files step of the create form beyond a
minimal `{ id, title, body }` shape, and it blocks any "app is ready to create"
validation rule.
