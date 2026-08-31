# 0026 — Deleting a partial app

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N9`. A gap: the delete confirmation names four resources, and a
partial app has fewer.

## Context

The build plan's delete flow is specific: a confirmation *"naming all four
resources destroyed"* — bucket, KB and data source, chat table, registry row —
with the app name typed to confirm.

That copy is correct for exactly one kind of app: a complete one. 0013 establishes
that a partial app is the **default outcome of any mid-sequence failure**, not an
edge case. So the most dangerous delete in the system — the one where the operator
is least sure what exists — is the one where the confirmation dialog is guaranteed
to be wrong.

Three distinct problems hide under one heading:

**1. The confirmation lies.** An app that failed at B4 has a bucket and objects and
no KB, no table, no registry row. A dialog saying four resources will be destroyed
is both false and unhelpful: the operator cannot tell whether "KB" not being deleted
means it never existed or that deletion failed.

**2. There may be nothing to delete *from*.** If the registry row is written at B6
as the spec says, a failure before B6 leaves an app with **no row** — so the
dashboard cannot list it, and `deleteApp(appName)` has nothing to look up. Deleting
an invisible app requires either knowing its name by other means or a discovery
mechanism the surface does not have. 0013's recommendation (row first, as `pending`)
dissolves this; the spec's ordering does not.

**3. Delete can itself partially fail**, and `deleteApp(appName) → void` cannot say
so (0015 already notes this). Half-deleting a partial app produces a state with no
name at all.

There is also a live-resource hazard specific to `Retain`. Gali's own bucket and
table are declared `DeletionPolicy: Retain` / `UpdateReplacePolicy: Retain`
(`template.yaml:84-85, 109-110`), deliberately, so CloudFormation cannot destroy
patient data. The factory creates per-app resources with SDK calls, not IaC (0002),
so **nothing gives the factory that protection for free**. A factory delete is an
unconditional `delete_table` on a table holding conversation history.

## Options considered

1. **Delete what exists, report what was deleted.** The confirmation is built from
   the app's actual state rather than from a fixed list of four, and the result is a
   per-resource outcome, not `void`.
2. **Keep the fixed four-resource confirmation** and treat absent resources as
   already-deleted successes. Simplest; the dialog stays wrong.
3. **Refuse to delete a partial app** — require it to be retried to completion
   first, then deleted. Guarantees the confirmation is accurate; leaves an
   unfinishable app permanently undeletable, which is worse.
4. **Two separate operations**: `deleteApp` for complete apps and
   `abandonProvisioning` for partial ones. Honest about the difference; two code
   paths for one intent, and the operator has to know which state the app is in
   before choosing.

## Recommendation

**Option 1 — the confirmation is generated from the app's real state, and delete
returns a per-resource outcome.**

The confirmation dialog exists to make the operator's mental model match reality
before an irreversible action. A dialog listing resources that do not exist does the
opposite: it teaches the operator that the list is boilerplate, which is precisely
the habit that makes the type-the-name safeguard useless. Generating it from state
costs one extra read (`getApp`, which 0015 recommends adding anyway) and makes the
dialog informative rather than ceremonial.

Returning a per-resource outcome rather than `void` follows for the same reason
create needs it: teardown is a multi-step AWS operation and any step can fail. The
shape should be the same vocabulary 0013 defines, so a half-deleted app is a state
the App list can render instead of a mystery.

Two hard constraints to fold in, neither of which is really about UI:

- **The registry row is deleted last, not first.** It is the only thing that makes
  the app visible; removing it first turns a failed teardown into an invisible
  orphan — the same bug as create, mirrored. State this in 0006's compensating-action
  table.
- **The chat-history table holds patient conversations.** Recommend the delete
  confirmation names it explicitly as conversation data and states the row count if
  it is known, rather than listing it as "table". Gali's production template goes out
  of its way to make that table undeletable by CloudFormation; a factory that deletes
  it on a typed confirmation should at least say what it is.

Option 3 is rejected on one case: an app that fails at B4 because its KB cannot be
created will fail every retry, so requiring completion before deletion makes it
permanent.

## Consequences

- `deleteApp` returns a per-resource outcome, which changes the 0015 surface —
  those two ADRs should be accepted together.
- The delete confirmation needs the app's state, so `getApp` becomes a Milestone-1
  requirement rather than a nice-to-have.
- `U8` in the checklist ("confirmation naming all four resources destroyed") is
  superseded by this: the count is not four, it is however many exist, and 0012 may
  add a fifth for complete apps.
- If 0013's `pending`-row-first recommendation is accepted, problem 2 above
  disappears entirely and this ADR gets simpler. If it is not, the factory needs a
  discovery path for unlisted resources, which is new work nobody has scoped.
- The mock backend must produce partial apps from day one (`U14`), so it must also
  produce a partial-delete outcome, or the UI path for it will never have been
  exercised.
