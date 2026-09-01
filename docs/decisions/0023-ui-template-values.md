# 0023 — Templates and colour schemes are two separate fields

Status: DRAFT on the names and the pair list. **The model is DECIDED by EB
(2026-09-01): `uiTemplate` is a closed enum of structural templates, and the colour
scheme is a separate field with presets plus a custom option.** Implemented on that
basis; the role names, the contrast pair list, and the wire names are queued.
Date: 2026-08-31
Revised: 2026-09-01, after EB's decision

Checklist rows `N6` / `A2`, and now the theming system as a whole.

## Decided by EB

- **`uiTemplate` is a closed enum of built structural templates**, starting with one
  member derived from Gali's current design.
- **The colour scheme is separate**: preset schemes, plus a custom option where the
  creator picks a colour per role.

The separation is the decision that matters. Colour as part of the template would mean
five colour choices multiply into five templates, and every new palette becomes a code
change. Colour as a separate field means one template can serve every app the factory
ever creates.

## `uiTemplate`

```ts
export const UI_TEMPLATE_IDS = ['clinic-rtl'] as const;
export type UiTemplateId = (typeof UI_TEMPLATE_IDS)[number];
```

One member, and one list that the schema and the render path both read. Adding a
template means building one and adding it here.

**Why an enum and not a string with a fallback:** a free string moves the failure from
the create form, where the creator is present and can fix it, to render time, where
the person affected is a patient looking at an app that is not the one the registry
says it is. `UI_TEMPLATE_UNKNOWN` in the error dictionary (0032) is a validation
failure with no registry row, which is the correct place for it.

`clinic-rtl` is the value both spec examples use — the spec's word, not an invention.
**Whether it is the right name is still Q22**, and renaming it later is a data
migration, because the id lands in every registry row.

## The colour scheme

### The role set

Nineteen semantic roles, in `types/colourScheme.ts`. **Semantic, not chromatic** —
`surfaceBrand`, never `sage800`. A template paints with roles, so a scheme can change
every colour without the template knowing anything about it.

The roles were derived **one-to-one from what Gali's stylesheet actually paints**, not
from a generic design-system checklist. Six surfaces, six text roles, four border
roles, two interaction roles, and one shadow tint. The full mapping with provenance
per value is in `docs/gali-ground-truth.md` §11 and in the doc comment on
`GALI_SAGE_SCHEME`.

Two options were weighed for the shape of a scheme:

1. **A scale.** A scheme supplies a ramp — 25 through 950 — and the template maps roles
   to steps. This is literally how Gali is built, and it is fewer values to author.
   Rejected: it forces every scheme to be a monochromatic ramp, and it puts the
   role→step mapping inside the template, so changing which step a border uses becomes
   a code change.
2. **Roles.** Nineteen named values per scheme. **Chosen.** More to author, and the
   template never learns a colour name.

The cost is stated plainly: nineteen values × five schemes is ninety-five values, and
a creator authoring a custom scheme fills in nineteen fields. That is the price of the
template not hard-coding Gali's scale.

### Completeness is enforced, not hoped for

> Every scheme must fill exactly the same variable set. A scheme with missing
> variables breaks the template.

`colourSchemeSchema` is **generated from the role list** rather than written out, so
adding a role cannot leave the schema behind. `z.strictObject` rejects an extra key;
the generated shape rejects a missing one. A partial scheme leaves a template painting
with `undefined`, which CSS resolves as "inherit" — an app that looks broken in a way
no test catches and no error reports.

### The contrast guard

**WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI components. Checked at
save time, not at render time.** In a medical setting this is an accessibility
requirement, not a preference — a patient who cannot read the answer has not been
answered.

Implemented as three modules with one job each: `lib/colourContrast.ts` holds the
specification's arithmetic and knows nothing about roles;
`lib/colourSchemeValidation.ts` applies the pair list to a scheme;
`lib/appConfigSchema.ts` turns failures into validation issues.

Four decisions inside that:

- **The checked pairs are an explicit list, not every role against every role.** Most
  combinations never meet on screen, and a guard that flags impossible pairs is a guard
  people switch off. Nineteen pairs, each carrying a one-line reason so the error
  message can say why it matters. **The list and each pair's size classification are
  queued (Q39)** — which text is "large" is a typography fact about a template that
  does not exist yet.
- **Every failure is reported, not the first.** A creator fixing one colour at a time
  through a sequence of errors is in a maze.
- **Comparison is against the unrounded ratio.** 4.499 must fail; rounding first would
  pass it.
- **The aggregator is total — it never throws.** It runs inside a zod refinement, and a
  refinement that throws turns `safeParse` into something that throws. A pair whose
  colours are unparseable is skipped, because the per-field hex check has already
  rejected that value. This was found by a test, not foreseen: a malformed colour used
  to escape as a `RangeError` out of the luminance arithmetic.

### The gate is on custom schemes, and Gali's preset does not pass it

This is the sharpest thing in this ADR.

**Gali's real palette fails WCAG 2.1 AA in four checked pairs.** Computed from the
values in `Gali-frontend/src/index.css`:

| pair | ratio | required | what it is |
| ---- | ----- | -------- | ---------- |
| `textAccent` on `surfaceRaised` | **3.99** | 4.5 | `--sage-600`, the copy action inside a bubble |
| `textAccent` on `surfaceCanvas` | **3.76** | 4.5 | the same colour as an eyebrow label |
| `textAccent` on `surfaceSubtle` | **3.60** | 4.5 | the same inside an info card |
| `borderFocus` on `surfaceRaised` | **1.98** | 3.0 | `--sage-400`, the focused composer border |

The accent failures are one root cause: `--sage-600` (`#4a8b7a`) is used only at 10 to
11 pixels — `.label-eyebrow` at `0.68rem`, `.ornament-rule span` at `0.625rem`, the
copy button at `11px` — so the 4.5:1 threshold applies to all of them and none clears
it. Raising that one value to roughly 4.5:1 on white fixes all three.

The focus border is not a near miss. At 1.98:1 the focused state of the composer is
close to invisible; the accompanying focus ring is `rgba(45,90,76,0.12)`, which is
fainter still. Keyboard focus is fine — `:focus-visible` uses `--sage-600` at 3.99:1
against white, which clears the 3:1 required of a focus indicator.

**So the contrast gate applies to custom schemes only.** Gating the presets too would
make app #1 uncreatable by the factory that exists to create it, and silently
"correcting" Gali's palette would change a validated system's appearance without
anyone deciding to. Instead:

- `gali-sage` ships with Gali's values, unaltered.
- `tests/lib/colourSchemes.test.ts` asserts **exactly which four pairs fail and at what
  ratios** — a characterisation test. The defect is recorded in executable form, and
  when the palette is fixed the test fails and forces someone to update it.
- The same colours supplied as a **custom** scheme are rejected. Identical values,
  different answer, because one is a recorded exception and the other is a new choice.
  A test pins that asymmetry so nobody "simplifies" it away.

**This is a real accessibility defect in production Gali, found while doing something
else, and it is not this repo's to fix.** Queued as Q41.

### The four proposed schemes

`clinical-blue`, `warm-clay`, `slate-neutral`, `quiet-plum`. All four fill all
nineteen roles and **clear every checked pair** — verified numerically, and asserted
by a test rather than asserted in prose.

They are visibly darker in the accent than Gali is, and that is a consequence of
passing rather than a style choice: an accent that clears 4.5:1 on white cannot be as
light as `--sage-600`.

## What is deliberately not in the role set

**No status colours — no error, warning or success role.** Gali has none to copy, and
this was checked rather than assumed: the frontend contains **no hex colours, no
Tailwind colour classes outside the sage and bone scales, no `rgba()`, and every SVG
uses `currentColor`**. Its one error path renders the message as an ordinary assistant
bubble.

So a Gali-derived scheme cannot supply a status colour, and inventing one would be
guessing a value that must match Gali. The factory's own admin UI is **not** themed by
these schemes — it has its own palette — so nothing about the factory's error
rendering is blocked. Whether the chat template needs status colours at all is Q42.

One more thing worth recording, because it is good practice and easy to lose: **Gali
distinguishes links by underline, not by colour.** Markdown links inside a bubble carry
`underline underline-offset-2` and no colour class, so they inherit the bubble's text
colour. That is why there is no `textLink` role, and it is also why the phone-number
links pass contrast automatically.

## Consequences

- `AppConfig` gains `colourScheme`, a discriminated union on `kind` so an error points
  at the branch the creator chose rather than reporting both as wrong.
- `uiTemplate` narrows from `string` to the enum. `UI_TEMPLATE_UNKNOWN` and
  `COLOUR_SCHEME_INCOMPLETE` and `COLOUR_CONTRAST_INSUFFICIENT` are already in 0032's
  dictionary as validation codes.
- **The template must consume roles as CSS variables**, or none of this works. A
  template that hard-codes `bg-sage-800` cannot be re-coloured, and nothing in the type
  system prevents that — it is a review discipline, like prompt-part symmetry in 0031.
- **Presets are data, so they need a test**, and they have one: completeness, hex
  format, and contrast.
- A custom scheme is nineteen colour pickers. That is a real UI cost and the create
  form should offer presets first and custom as a deliberate step, not as a peer choice.
- **The five schemes are all light.** No dark scheme is proposed, because Gali has no
  dark mode to derive one from and a dark scheme is not a recolour — it inverts which
  roles are light. Q42 covers it.
