# 0023 — The set of valid `uiTemplate` values

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N6` / `A2`. A gap: the create form's first field is a choice from a
set nobody has enumerated.

## Context

`uiTemplate` decides which chat UI an app renders. ADR 0008 settled its name and
casing. Nothing has settled its values.

Everything the sources say:

- The spec's `app.config.json` example: `"ui_template": "clinic-rtl"`.
- The registry row example: `"ui_id": "clinic-rtl"`.
- F1: the creator *"picks a name and a ready UI template"* — so the set is
  closed and pre-built, not authored per app.
- ADR 0007 settled that `ui_id` is an ordinary attribute holding the template
  name, **not a key and not unique per app** — so many apps share a template.

That is one example value, appearing twice, and it is the same value in both. There
is no list.

The Gali frontend is the only real template in existence, so `clinic-rtl` is
presumably a description of it. That is an inference, not a finding: the string
`clinic-rtl` appears nowhere in either Gali repo.

Why this blocks more than a dropdown:

- The create form's **first** field is this one. A field with an unknown domain
  cannot be validated, so the first thing a creator does is the thing the schema
  cannot check.
- A template is code that has to exist at *render* time in the Next app. So the
  valid set is not open data — it is bounded by what has been built, and an
  `AppConfig` naming a template the app does not ship is an app that cannot render.
- `U5` says no design system is to be invented and Gali's conventions are to be
  inherited. Whatever the first template is, it is Gali's UI generalised.

## Options considered

1. **A closed union of built template ids**, declared in one module, validated by
   the zod schema as an enum. An unknown value is a validation error at the
   boundary. The set grows only when a template is built.
2. **A free string**, validated only as non-empty, with the render path falling
   back to a default when it does not recognise the value. Unblocks the form today;
   moves the failure from create time to render time.
3. **A registry of templates fetched from the backend**, so the set is data rather
   than code. Fits a future where templates are added without a frontend deploy,
   and contradicts the fact that a template *is* frontend code.

## Recommendation

**Option 1, starting with exactly one member.**

The set should contain what exists, and what exists is one template — the
generalisation of Gali's UI. Naming it `clinic-rtl`, because both spec examples use
that string and there is no competing evidence, gives a one-member enum today and a
compile error the day someone adds a second template without registering it.

Option 2 is the tempting one and it is wrong for a specific reason: it moves a
failure from a form field, where the creator is present and can fix it, to render
time, where the person affected is a patient. A silent fallback to a default
template means an app can be created that looks correct in the registry and renders
as something else. That is worse than being unable to create it.

Option 3 solves a problem the factory does not have yet: templates are React code
in this repo, so the backend cannot add one. Revisit it if templates ever become
data.

What is EB's, and is why this stays a draft: **whether `clinic-rtl` is the right
name**, and whether the first template is a faithful generalisation of Gali's UI or
a new design. A one-member enum is easy to extend and awkward to rename, because
the value lands in the registry row of every app created before the rename.

## Consequences

- `AppConfig.uiTemplate` narrows from `string` to a union, and the zod schema from
  `z.string().min(1)` to an enum. Both are currently marked BLOCKED with a pointer
  to this ADR.
- The valid set lives in one module and is imported by the schema, the create form
  and the render path — one list, three consumers, no drift.
- A template id, once in a registry row, is effectively permanent for that app
  unless a migration rewrites rows. So renaming a template is a data migration, not
  a refactor.
- Adding the second template is the moment this decision is tested: it should
  require touching exactly one list.
