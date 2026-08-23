# 0008 — AppConfig field names and casing

Status: accepted
Date: 2026-08-23

## Context

`AppConfig` is the JSON the create form produces and the provisioning backend
consumes. It is the contract this whole milestone exists to define, so its field
names are the most expensive thing in the repo to change later.

The two sources disagree on nearly every field.

Architecture spec, `app.config.json` at F1:

```json
{ "app_name": "gali-ivf", "ui_template": "clinic-rtl", "language": "he" }
```

Architecture spec, the request body at F4:

```json
{ "app_name": "...", "ui_template": "...",
  "sp_sections": { ... }, "rules": [ ... ], "data_sections": [ ... ] }
```

Build plan, `types/appConfig.ts`:

| field | meaning |
| ----- | ------- |
| `appName` | the key tying bucket, table and registry row together |
| `uiTemplate` | which chat UI template the app renders |
| `systemPrompt` | five named parts: identity, language, voice, rules, formatAndFlags |
| `dataFiles` | markdown knowledge files, each with path and body |
| `disclaimers` | TBD in the spec — type the field, comment it unresolved |

The conflicts:

1. **Casing** — `snake_case` on the wire in the spec, `camelCase` in the type.
   Same question as 0007 and should be answered the same way for both.
2. **`language`** — present in the spec's `app.config.json`, absent from the
   build plan's `AppConfig`. Meanwhile `_LANGUAGE` is one of the five
   system-prompt parts. Is the top-level `language` a second, separate field
   (layout direction, UI locale) or is it the same thing captured twice?
3. **`sp_sections` vs `systemPrompt`** — a container of five parts either way,
   but the key names inside differ: `_IDENTITY` / `_LANGUAGE` / `_VOICE` /
   `_RULES` / `_FORMAT_AND_FLAGS` in the spec, `identity` / `language` / `voice`
   / `rules` / `formatAndFlags` in the build plan. The order is the same in
   both, which is the part that matters most; the names are not.
4. **`data_sections` vs `dataFiles`** — different shapes, not just names. The
   spec has `{ id, title, body_md }`, the build plan has `{ path, body }`. So:
   is `path` derived from `id` (`prep` → `kb/prep.md`), and if so where does
   that derivation live, frontend or backend? And where does `title` go — is it
   dropped, or is it a heading inside the markdown body?
5. **`disclaimers`** — in the build plan, absent from every spec JSON. Its
   format and storage are TBD; see 0011.
6. **`rules`** — see 0009, it needs its own decision.

## Options considered

1. **Spec wire format wins.** `AppConfig` is typed `snake_case`, matching what
   is actually sent. No mapping layer. The type reads unlike the rest of the
   TypeScript.
2. **Build-plan names win, serializer maps.** `AppConfig` is `camelCase` and
   idiomatic; the single exported serializer converts to the spec's wire names.
   The mapping is one module and is tested, but the two vocabularies both exist.
3. **camelCase end to end**, spec JSON treated as illustrative. Simplest, and
   silently redefines the contract the backend was described against.

## Decision

Option 2. **Naming follows each language's own convention, with exactly one
mapper at the BFF boundary.**

- `snake_case` on the wire and in Python — the request body the provisioning
  service receives, and everything inside it.
- `camelCase` in TypeScript — `AppConfig`, the zod schema, every component and
  hook.
- The translation lives in **a single module inside the route handlers** under
  `app/api`. **Nothing else in the codebase translates.** A field name is
  `camelCase` everywhere above that module and `snake_case` everywhere below it.

Settled by extension, from 0009: **`rules` is not a top-level field.** The five
system-prompt parts live in one container and `rules` is one of them.

## Reasoning

Each of the three surfaces has an idiomatic form, and the disagreement in the
spec is not a real disagreement — it is one artefact written from the Python side
and another written from the TypeScript side. Option 1 makes every React
component read `app_name`, which is wrong in TypeScript and stays wrong forever.
Option 3 silently redefines the contract the backend was described against, and
the backend is Python, where `appName` is equally wrong.

The cost of option 2 is that two vocabularies exist and a mapping layer can drift
from either side. Confining the mapper to one module inside the route handlers is
what keeps that cost bounded: it is one file, it is tested, and it is the same
place 0005 already puts validation and error normalisation. A mapper called from
two places is the failure mode, so the count is one.

## Consequences

- `types/appConfig.ts` is `camelCase` and unblocked.
- One exported mapper module inside `app/api`, tested in both directions, and it
  is the only place a name changes form. A conversion anywhere else — in a
  component, a hook, or `services/factoryApi.ts` — is a bug.
- `services/factoryApi.ts` speaks `camelCase` only. It never sees a wire name.
- The same convention governs the registry row, so 0007's casing question is
  answered by this ADR. What 0007 still owes: the partition key, whether
  `created_at` is in the row, and whether `ui_id` is a template identifier or a
  unique row id.
- Still open and not decided here: `language` as a top-level field vs `_LANGUAGE`
  (item 2 above), the `data_sections` / `dataFiles` shape (0010), and
  `disclaimers` (0011). This ADR fixes names and casing, not membership.
