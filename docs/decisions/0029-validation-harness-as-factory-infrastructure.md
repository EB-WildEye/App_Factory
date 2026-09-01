# 0029 — The validation harness is factory infrastructure

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Nothing in the architecture spec, the build plan, the checklist or any other ADR
mentions validation. That is the gap this ADR exists to name.

## Context

Every app the factory creates is a clinical assistant that will need
ethics-committee approval. So every app needs its own approved question set and a
way to show that a change did not alter its answers. That makes the harness a
**platform capability**, not a Gali chore — and right now it is a Gali chore:
a set of scripts and spreadsheets inside `Gali-AWS-backend` that no other app can
use.

Gali's apparatus, read 2026-08-31. It is more developed than anything in this repo
and it is the right starting point precisely because it survived a real committee.

| piece | what it is | provenance |
| ----- | ---------- | ---------- |
| The question bank | An **Excel workbook authored by a doctor**, with a `Question Bank` sheet and one answer column, `תשובה של גלי`. **380 questions.** Versioned by hand: V28, V29, V30 | `validations/שאלות ואלידציה לגלי*.xlsx`, `scripts/run_validation.py` |
| The runner | Dispatches every question to `/chat` **under a fresh unique session id — strict isolation, zero shared context between questions** — on a bounded thread pool with backoff on 503, retrying stragglers once sequentially. Then pulls each answer from DynamoDB and writes **only** the answer column | `scripts/run_validation.py` |
| The verifier | Four invariant checks after **every** dump: every row filled; **every non-answer cell byte-identical to a committed baseline**; no prompt-identity leakage; no broken-render degradation marker. `Exit 0` iff all pass | `scripts/verify_dump.py`, `validations/nonanswer_baseline.json` |
| The committee artefact | `committee_dump_<sha>.xlsx` plus `committee_checkpoint_<sha>.json`, **named by the commit they were produced from** — hash-bound | `validations/`, and HEAD's own message: *"finalize v4 committee dump — durable + hash-bound"* |
| Run metadata | `validation_run_metadata.json` | `validations/` |
| Classifier validation, separately | `ground_truth.csv`, a held-out question set (`holdout_qnums.json`), predictions, and `validate_classifier.py --scope holdout`. The classifier prompt is **locked at `a635c2e`** | `scripts/validate_classifier.py`, `docs/VALIDATION_CHANGELOG…` |

Four things in there are load-bearing and worth stating as findings, because a
naive harness would get all four wrong:

1. **Session isolation per question.** Every question runs in its own session. Not a
   performance detail: Gali's answers depend on conversation state (the once-only
   disclaimer, the Bedrock session id, the `prior_assistants` count), so questions
   sharing a session would contaminate each other and the run would be unrepeatable.
2. **The doctor's columns are immutable.** The verifier's second check exists because
   the workbook is a clinical document that a run must not edit. A harness that
   rewrites the question text has destroyed the evidence.
3. **Artefacts are bound to a commit.** `committee_dump_<sha>` means a committee
   approval refers to a specific code state. Without that binding, "approved" is a
   claim about nothing.
4. **The pass criterion is not zero failures.** The changelog records a known issue
   deliberately shipped: *"2 rows, below the ≥5 failure-class threshold; changing a
   safety scrub for a cosmetic carries more risk than the defect"*, with a reviewer
   note. So the real criterion is a **failure-class threshold plus documented
   exceptions** — which is a policy, not an assertion.

## What a question set is

Proposed definition, for the factory:

- **An ordered list of questions, versioned, owned by a clinician**, not by
  engineering. Gali's is an Excel workbook because that is what a doctor will
  actually edit — and that is a feature, not technical debt to be normalised away.
- **Immutable once a run refers to it.** A run cites a question-set version; editing
  the set produces a new version.
- **Per app.** Gali's 380 questions are about abortion protocols and would be
  meaningless for app #2. There is no shared corpus, and pretending otherwise is how
  a validation run stops meaning anything.
- **Optionally partitioned**, as Gali's is: a main bank plus a held-out subset used
  for the classifier so that tuning cannot be evaluated on its own training cases.

What a question set is **not**: a test suite. There are no expected answers. The
output is prose for a human to read, and the only automatic checks are invariants
(§verifier) rather than assertions about content.

## What a divergence run compares

Two answer sets over the same question set, produced by two configurations, so that
a human reads only what changed.

| axis | A | B | the question it answers |
| ---- | - | - | ----------------------- |
| **prompt change** | current prompt | candidate prompt | did rewording change behaviour? This is exactly what `docs/gali-five-parts-draft.md` needs |
| **model change** | current model id | new model id | is the new model safe here? |
| **retrieval change** | current KB | re-chunked or re-embedded KB | did an ingestion parameter change answers? relevant to `N13`/`N14` |
| **runtime change** | current code | candidate code | did a guardrail edit change output? |
| **reference** | app #1 today | generic-Gali under the factory | the Milestone-1 definition of done |

A run therefore produces, per question: answer A, answer B, and a **divergence
classification**. The classification is the interesting part, and it is where a
harness earns its keep:

- **identical** — byte-equal. Needs no human.
- **equivalent** — different words, same clinical content and same referral. Needs a
  human once, and the judgement should be recorded so a re-run does not ask again.
- **divergent** — different content, different referral, or a flag/referral present in
  one and absent in the other. Always needs a human.

Two invariant families should be checked mechanically on **both** sides, because
they are not judgement calls: the verifier's existing leakage and degradation checks,
and referral presence — a red-flag question whose answer lost the emergency phone
number is a failure regardless of how similar the prose is.

## What counts as a pass

Proposed, following Gali's actual practice rather than an ideal:

1. **Every question answered.** A gap is a failed run, not a low score.
2. **Every invariant check green** on both sides — fills, non-answer byte-identity,
   no leakage, no degradation marker, referral preserved where the reference had one.
3. **Zero unreviewed `divergent` rows.** Every divergence is either accepted with a
   recorded reason or fixed.
4. **A failure-class threshold, not a row count.** Gali's `≥5` says: five rows failing
   the *same way* is a defect, two rows failing differently may be a known issue.
   Carry that shape forward, and require the threshold to be **stated per app** —
   because it is a clinical risk judgement, not a constant.
5. **A named human signs it.** The artefact records who, when, and against which
   commit.

Explicitly not a pass criterion: similarity scores. An automated similarity metric
over clinical answers invites a threshold nobody can defend to a committee.

## Where results are stored

Options, and the trade is between reviewability and repo hygiene:

1. **In the app's S3 bucket**, under a `validation/` prefix beside `kb/` and
   `prompt/`. Per app by construction, no repo growth, and the Data Center can
   already list the bucket.
2. **In the factory repo**, as Gali does today — dumps and checkpoints committed.
   Diffable and durable; grows the repo with binary spreadsheets, and puts patient-
   adjacent clinical content in git.
3. **In a dedicated table plus S3**, with a registry-style index of runs.

**Recommend 1, with the run index in the registry.** A validation run is an artefact
*about an app*, and every other artefact about an app lives in that app's bucket. It
also means deleting an app deletes its validation history — which is a consequence to
decide deliberately, not to discover: an ethics-committee submission may need to
outlive the app, in which case the artefact belongs somewhere the teardown does not
reach.

Each run should store: the question-set version, both configurations, the two answer
sets, the divergence classification per row, the invariant results, the commit sha,
and the signature. Hash-bind the artefact as Gali does.

## Options considered

1. **Lift Gali's scripts into the factory as a shared harness.** Fastest to something
   real; carries an Excel-shaped interface and Gali-specific column names.
2. **Build a harness into the factory as a first-class surface** — a Dev Dashboard
   screen, runs triggered from the UI, results in the app bucket. Coherent with the
   platform; a lot of new work, and none of it is Milestone 1.
3. **Keep validation per app, outside the factory**, and have the factory only
   *record* that a run happened and passed. Minimal; the harness stays a chore each
   app re-invents.
4. **Do nothing yet**, and let app #2 be the forcing function.

## Recommendation

**Option 3 now, option 2 as the shape to grow into, and option 1 as the source
material — in that order.**

The reason not to build the harness now is that its requirements come from having a
second app, and there is not one. The reason not to do nothing is different and more
urgent: **the App lifecycle already needs a validation state, and adding it later
means migrating every registry row.** So the minimum that should land early is not a
harness at all, it is the lifecycle hook.

Concretely, the minimum:

- The registry row records **validation state** — `not_validated`, `run_in_progress`,
  `passed`, `failed` — plus the question-set version, the run artefact location, the
  commit sha and the signer.
- The Admin list shows it, and `not_validated` is the **normal state of a newly
  created app**, displayed as neutral rather than as an error.
- Nothing in the factory *enforces* it in Milestone 1. An app can be created,
  configured and used while unvalidated, because enforcement is a policy question
  (below) and a half-built platform should not invent one.

And one thing worth doing early because it is nearly free: keep the divergence
comparison **out of the harness** and in a pure module, the way `composeSystemPrompt`
is pure. Classifying two answers as identical / equivalent / divergent needs no AWS,
no spreadsheet and no network, so it can be written and tested in this repo now and
reused by whatever harness eventually exists.

## Consequences

- **The registry row grows four fields**, which is new work for 0007 — and 0007 is
  accepted, so this is an amendment to it rather than a free addition.
- **The App lifecycle gains a state that is not about provisioning.** 0013's
  vocabulary (`pending`, `provisioning`, `complete`, `partial`, `failed`) describes
  whether resources exist. Validation state is orthogonal: a `complete` app can be
  `not_validated`, and a `passed` app can be `partial` after a failed edit. Two
  independent axes, and the App list has to show both without implying one means the
  other.
- **`U6` in the checklist changes** — the App list columns are no longer just
  appName, KB id, Dynamo id and provisioning state.
- **A new question the factory cannot dodge for long:** may an unvalidated app serve
  patients? Milestone 1 says yes by omission. Somebody has to say it on purpose.
- Whether app #1's existing 380-question bank and its committee artefacts are
  migrated into the factory's shape, or left where they are and merely referenced, is
  0018's territory.
- If validation artefacts live in the app bucket, **app deletion destroys the
  evidence of approval**. Either the delete path excludes `validation/`, or the
  artefact is copied somewhere the teardown does not reach. This is not a detail: an
  approval that vanishes with the app cannot be produced when someone asks about a
  conversation from last year.
