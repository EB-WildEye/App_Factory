# Questions for EB

Decisions that are yours, queued rather than guessed. Work continued around each
one. Newest at the bottom.

A question here is not the same as a draft ADR: the ADR carries the analysis, this
file carries the ask. Where both exist the ADR number is named.

---

## Q1 - Which Bedrock data source id is current, PPIUPPCKNN or FDN4IETFFW — CLOSED FOR THE FACTORY by draft ADR 0030; the production question stays open elsewhere
Blocks: the factory's data-source contract, and `E8` per-file re-embedding. Nothing in Milestone 1 UI, but no provisioning step can be specified until it is settled.
Options: (a) two data sources exist on KB CHAU7BWP4S, one CUSTOM (PPIUPPCKNN) and one S3 (FDN4IETFFW), both live; (b) FDN4IETFFW is stale config left over from the S3-sync era and the sync Lambda is dead code; (c) PPIUPPCKNN is stale and the scripts have not been run since.
Recommendation: (a), and confirm it in the console. `scripts/ingest_kb.py` and `scripts/kb_verify_reconstruct.py` both target PPIUPPCKNN as CUSTOM, and the sync Lambda is still deployed and wired to S3 uploads under `documents/`, so both paths look alive.
Read 2026-08-31, recorded and NOT acted on (you said this is being investigated elsewhere): `list-data-sources` on `CHAU7BWP4S` returns exactly one data source, `PPIUPPCKNN`; `get-data-source FDN4IETFFW` returns `ResourceNotFoundException`; and `list-knowledge-bases` returns exactly one KB in `eu-west-1`, so `FDN4IETFFW` is not a data source on some other KB either. That is evidence for option (b), not a decision. See `docs/gali-ground-truth.md` §9.4.
Default taken for now: none. Both ids stay recorded side by side in `lib/gali/constants.ts` as `GALI_CUSTOM_DATA_SOURCE_ID` and `GALI_SYNC_DATA_SOURCE_ID`. No code picks one, and nothing was changed on the strength of the read.
Closed for the factory 2026-09-01: draft ADR 0030 decides the factory provisions an **S3** data source, following the HTML spec, with no second path. That settles which door the factory uses and says nothing about which door production uses - that investigation is yours and nothing here acted on it.
Pointer only, added 2026-09-01: the parallel investigation's report is now in this repo at `docs/gali_readonly_audit_2026-09-01.md`. **This entry stays open and nothing here has been acted on**, per your instruction. One finding of that report which is *not* Q1 was verified and recorded, because it contradicted an accepted ADR of mine - the prompt-limit discrepancy, now Q43.

## Q2 - The spec's five KB chunking/embedding values cannot be confirmed against Gali — ANSWERED 2026-08-31 by reading AWS: all five confirmed
Blocks: the KB provisioning step, and the claim that generic-Gali reproduces Gali. Not Milestone 1 UI.
Options: (a) treat the spec's values (hierarchical, parent 500, child 150, cohere.embed-multilingual-v3, 1024) as the factory standard and accept that app #1's KB may differ; (b) read the real values off KB CHAU7BWP4S in the console and make those the standard; (c) leave the KB out of the factory contract until the console read happens.
Recommendation: (b) before any provisioning code exists. The spec states five values as fixed for every app; none of them appears anywhere in the Gali repos, because the KB was created outside the stack. Provisioning a KB with unverified parameters means app #1's validated corpus was never tested against the configuration the factory would create.
Resolved by (b). Read from KB `CHAU7BWP4S` on 2026-08-31: `HIERARCHICAL`, parent 500, child 150, `cohere.embed-multilingual-v3`, index dimension 1024 — **all five confirm the spec**. Recorded with the exact commands in `docs/gali-ground-truth.md` §9.
What the read added, which nobody had asked for: four parameters production sets and the spec never mentions — `overlapTokens: 30`, `distanceMetric: euclidean`, `FLOAT32`, `dataDeletionPolicy: DELETE` — plus one placement correction, that 1024 belongs to the vector index and not to the KB. The two that change behaviour are now checklist `N13` and `N14`, and they are the subject of Q27.

## Q3 - Should the Gali constants have a committed regeneration script — ANSWERED 2026-08-31: yes, (a)
Blocks: nothing. Re-copying constants after a Gali change was a manual read.
Options: (a) commit a `scripts/` generator that regenerates `lib/gali/constants.ts` and the digest table in `docs/gali-ground-truth.md` from the Gali repos; (b) leave it manual, guarded by the golden test; (c) commit the generator but keep it excluded from the gates.
Recommendation: (a). The strings are 21,000 characters of Hebrew clinical text; hand-copying them is how a byte-level drift gets introduced, and the golden test only catches drift after it has been committed.
Resolved: `scripts/generate_gali_constants.py` is committed. It regenerates `lib/gali/constants.ts` in full and four marked regions of `docs/gali-ground-truth.md` (the two verbatim prompt blocks, the per-part table, the digest table); the surrounding prose is hand-owned and untouched. `--check` verifies without writing and exits 1 on drift, so it can join the gates in CI. Proof it is faithful: running it against the already-committed files changed nothing but the markers and one header line.

## Q4 - Is there a top-level `language` field in AppConfig
Blocks: the `AppConfig` shape, the wire body, and the first screen of the create form. ADR 0008 fixes names and casing and says in as many words that membership is still open.
Options: (a) no top-level field - `_LANGUAGE` in the prompt parts is the only place language is stated; (b) a top-level `language` field for UI locale and layout direction, separate from the prompt part; (c) one top-level field that the composer renders into `_LANGUAGE`.
Recommendation: (b). They are two different things that happen to share a word. `_LANGUAGE` is prompt text telling the model which language to answer in - Gali's is 503 characters of grammar rules. UI locale decides `lang`/`dir` on the document. Collapsing them means a creator cannot have an RTL Hebrew shell around a multilingual assistant, which is exactly what Gali is.
Default taken for now: none. The field is absent from `types/appConfig.ts`, and the strict zod schema **rejects** a config carrying it, so no code can start depending on either answer. A test pins that rejection.

## Q5 - What is the precedence flag called, and where does it live — ANSWERED by EB 2026-09-01: (a), AppConfig only
Blocks: putting the ADR 0009 flag into `AppConfig`, and the create-form control for it. The 0009 amendment states the flag exists and that its name and home - `AppConfig`, the registry row, or both - are not settled.
Options: (a) a field on `AppConfig` only, so it is part of the config the backend consumes; (b) an attribute on the registry row only, so it is operational state; (c) both, with `AppConfig` as the source and the row as a cache for the dashboards.
Recommendation: (a). It changes the composed prompt, and the composed prompt is built from `AppConfig`. A registry attribute that can disagree with the config that produced the prompt is a two-sources-of-truth bug waiting for the first edit.
Resolved by (a). Implemented as `AppConfig.renderPrecedenceText`, a required boolean with **no schema default** - the default (on for new apps, off for Gali) belongs to the create form, and a schema default would silently turn an omitted field into "on" for any config assembled elsewhere, including Gali's. `composeSystemPrompt` now takes the config and reads the flag from it, replacing the argument workaround a caller could set inconsistently with the config the parts came from. ADR 0009 carries the amendment.
Only the wire name is still open - Q40.

## Q6 - Where in the composed prompt does the precedence text go, and in which language
Blocks: the exact bytes of every new app's prompt. Not Gali - its flag is off.
Options: (a) immediately after the `rules` part, before `formatAndFlags`; (b) at the very end, after `formatAndFlags`; (c) at the very start, before `identity`.
Recommendation: (a). It is a statement about how rules relate to retrieved material, so it reads where the rules are. Second question, separable: ADR 0009 quotes the text in English, and every app so far is Hebrew RTL - a Hebrew app almost certainly wants Hebrew prompt text, and an English paragraph in a Hebrew prompt is itself a behaviour change.
Default taken for now: (a), in the ADR's English wording, isolated in one named constant `PROMPT_PRECEDENCE_TEXT` and one line of `lib/composeSystemPrompt.ts`. Moving it is a one-line change with a test that pins the position.

## Q7 - What joins two authored rules inside the `_RULES` part
Blocks: the exact bytes of the prompt for any app with more than one rule. Not Gali - its `_RULES` is a single authored string, so a one-item list reproduces it under any separator, and a test pins that.
Options: (a) one newline per rule; (b) a blank line between rules; (c) a markdown list marker per rule (`- ` prefix, newline-joined).
Recommendation: (c) if the rules should read as a list to the model, (a) if they should read as prose lines. Gali's own `_RULES` is markdown with `##` headings and `-` bullets, which is weak evidence for (c). This is cheap to change and expensive to leave implicit, because it silently changes every multi-rule prompt.
Default taken for now: (a), isolated in the named constant `RULES_ITEM_SEPARATOR` in `lib/composeSystemPrompt.ts`.

## Q8 - Does the wire carry `_RULES` as a list or as the joined string
Blocks: the `POST /apps` body, and therefore what the provisioning service parses. Coupled to Q7: if the backend joins, the separator is the backend's business, not the form's.
Options: (a) the wire carries the authored list, and the frontend's composed preview is the frontend's business only; (b) the wire carries the joined string, so exactly one join exists and it is the one the preview showed; (c) both - list for editing, joined string for the record.
Recommendation: (b). ADR 0009 rejected option 3 (backend assembles) precisely so the create form's live preview is the real final string. If the backend re-joins, the preview is a guess again. Sending the joined string makes the previewed bytes the shipped bytes.
Default taken for now: (a), because it is the only shape with concrete evidence - the spec's F2 example is literally `"_RULES": ["rule_01", ...]`. `app/api/appConfigWire.ts` passes the list through unjoined and does not join, so the join still exists in exactly one place.

## Q9 - `disclaimers` has no wire name in any spec artefact
Blocks: serializing the field at all. Feeds ADR 0011, which owns format and storage.
Options: (a) `disclaimers` inside the request body, snake_case if it becomes multi-word; (b) not in the body - disclaimers are a KB document, so they arrive as a data file; (c) not in the body - disclaimers are prompt text, so they arrive inside `_FORMAT_AND_FLAGS`.
Recommendation: hold until 0011. Gali does **both** (b) and (c): an ingested document with `doc_id="disclaimers"`, and frequency rules inside the prompt's format part. If 0011 settles on either lane, this field may not need a wire name at all.
Default taken for now: absent from `WireAppConfig`. The serializer carries only the four fields that have a wire name, and a test pins that the body has exactly those four keys.

---

Each entry below has a draft ADR carrying the full analysis. The ADR number is
named; what is here is the two-line version.

## Q10 - ADR 0006: is the backend seven steps or six
Blocks: nothing in Milestone 1 UI. Blocks 0013's rollback coverage, because a step no count knows about is an orphan nobody deletes.
Options: (a) seven, and the live-flow lede miscounts by counting F4 twice; (b) six, B7 is outside the sequence because it is TBD; (c) there is a real eighth step, the KB's IAM role.
Recommendation: (a). The spec's own `FLOW` data contains B1-B7, so (b) requires believing the artefact lists a step the spec does not intend. Decide 0021 first - it is the test of whether (c) is true.
Default taken for now: none. The checklist keeps B1-B7 and no code depends on the count.

## Q11 - ADR 0010: what structure must a creator supply for a data file
Blocks: `AppConfig.dataFiles`, Data Center screen 3, and any "ready to create" validation gate. Screens 1 and 2 are not blocked.
Options: (a) a fixed section list every app must supply; (b) creator-defined sections, validated metadata over free markdown; (c) a fixed core plus optional extras.
Recommendation: (b), and the answer already exists in production - Gali enforces structure through a validated 9-key metadata record, not through a constrained body. See 0027.
Default taken for now: none. `dataFiles` is typed `readonly never[]`, so the only assignable value is the empty list and no shape can be assumed by accident.

## Q12 - ADR 0011: what format do disclaimers take, and where are they stored
Blocks: `AppConfig.disclaimers`, and whatever "creation requirement" turns out to gate.
Options: (a) prompt text in `_FORMAT_AND_FLAGS`, as `{ text, whenShown }` entries; (b) a markdown file in `kb/`, retrievable; (c) a file outside `kb/`, editable but not ingested; (d) a registry-row attribute.
Recommendation: (a). Gali does both (a) and (b), and the load-bearing half is the frequency rule - "once per conversation" versus "every time it recurs" cannot be expressed as a bare string, and it is the difference between a sufficient disclaimer and one the patient stops reading.
Default taken for now: none. `disclaimers` is `readonly never[]` and has no wire name at all (see Q9).

## Q13 - ADR 0012: subdomain record type and certificate
Blocks: B7 and its rollback. In Milestone 1, only whether the App list shows an address column.
Options: (a) one ACM wildcard for `*.<factory-domain>` plus a CNAME per app; (b) a certificate per app plus an A/ALIAS record; (c) no subdomain - apps live on a path.
Recommendation: (a). It keeps B7 a single reversible DNS write, which matters because B7 is the one step 0013 cannot currently describe a rollback for. (b) makes the last step of create slow, asynchronous and revocable.
Default taken for now: none needed. The spec already says an app works before it has an address, so "no address yet" is built as a normal state either way. What only you can supply: the factory domain, where its DNS is hosted, and whether a wildcard certificate exists.

## Q14 - ADR 0013: who cleans up a partial create, and what are the states called
Blocks: what the GUI offers on a partial app, and the status vocabulary the mock would otherwise invent.
Options: (a) the provisioning service unwinds synchronously; (b) the registry row is written first as `pending`, so a partial app is visible by construction; (c) a scheduled sweeper; (d) no automatic rollback - the operator chooses retry or delete.
Recommendation: (b) for visibility plus (d) for action. Options (a) and (c) both answer "how do we clean up an invisible orphan"; only (b) answers "why is it invisible". Cost: it contradicts the spec, which puts the row at B6.
Default taken for now: none. The ADR proposes `pending`, `provisioning`, `complete`, `partial`, `failed`; no code uses any of them yet.

## Q15 - ADR 0014: does createApp return 202 or resource ids
Blocks: the return type of `createApp`, the create form's last screen, and whether the App list polls.
Options: (a) 202 plus a job handle the GUI polls; (b) 202 with the registry row as the polling target; (c) synchronous, blocking, returning the ids.
Recommendation: (b), which needs 0013 accepted. (c) is not really available: API Gateway's integration timeout is 29 seconds and B4 is the longest step in the system, so a synchronous create would time out on success, not on failure.
Default taken for now: none. `services/factoryApi.ts` does not exist yet, so no signature has been committed to.

## Q16 - ADR 0015: the factoryApi route shapes and the normalised error shape
Blocks: `services/factoryApi.ts` and every route handler under `app/api` - most of Prompt 1.
Options: (a) implement the surface and record the paths as the contract the backend must satisfy; (b) settle paths first, then implement; (c) implement against the mock only, paths as placeholders.
Recommendation: (a), which is what ADR 0003 says this milestone is for. The ADR proposes ten routes, adds `getApp` and `deleteFile`, and copies Gali's one-helper error discipline as `{ error, code }`.
Default taken for now: none - route shapes are a CLAUDE.md Hard Rule 4 stop-and-ask.
Superseded detail, 2026-09-01: 0015's claim that per-file re-embedding may be impossible was corrected to "achievable, app #1 upserts per document" - and that correction held only because app #1 uses a CUSTOM data source. Draft ADR 0030 chooses **S3** for the factory, which restores the original constraint: `StartIngestionJob` has no file parameter. So the surface changes - `reembedFile(appName, path)` becomes `reingestKnowledgeBase(appName)`. **0030 should be accepted before 0015**, or 0015 will be accepted with a route that cannot exist.

## Q17 - ADR 0018: is Gali an exception, or does the factory reproduce it byte-for-byte
Blocks: nothing immediately, and quietly conditions every ADR that says "the spec fixes this value". It is the largest open question in the repo.
Options: (a) Gali stays as it is, the factory composes only for new apps, and app #1 becomes a migration project with its own validation run; (b) the factory composes Gali's prompt too, byte-identical before anything ships; (c) split it - reproduce the table and data source exactly, treat the prompt as the exception.
Recommendation: none, deliberately - this one is yours. What can be said: the prompt half of (b) is far more expensive than it looks, because Gali's five parts compose to 11,492 characters against a 4096 cap, so it needs a third prompt artefact authored and a clinician re-validation of a frozen system. The table and data-source halves are cheap by comparison.
Default taken for now: none, and nothing in code assumes an answer. What would settle it: whether a re-validation run of the 380-question set is on the table in this milestone at all.

## Q18 - ADR 0019: the factory's AWS region
Blocks: bucket-name validation, model-availability checks, and whether region is an `AppConfig` field.
Options: (a) one region for the whole factory, fixed at `eu-west-1`; (b) a per-app field defaulting to `eu-west-1`; (c) whatever region the stack is deployed to.
Recommendation: (a). Gali's model ids are region-prefixed inference profiles, so a per-app region makes a creator implicitly choose a model - and if the profile is missing in that region the app provisions cleanly and fails on the first chat request.
Default taken for now: none. `GALI_REGION` records Gali's region as a fact about app #1, not as a factory decision.

## Q19 - ADR 0020: the KB vector store — REFRAMED 2026-08-31 by reading AWS
Blocks: B4 and its rollback. No longer the largest cost decision in the factory, because the store turned out to have no capacity floor.
Options, as they now stand: (a) one shared S3 Vectors index for all apps, separated by metadata filter; (b) one S3 Vectors index per app.
Recommendation: (b), which reverses what this ADR originally recommended. The read killed the argument for sharing: the store is **`S3_VECTORS`**, not OpenSearch Serverless, and S3 Vectors has no minimum billed capacity — so per-app isolation, per-app deletion at teardown, and not having to get a metadata filter right all become nearly free. The four options the ADR originally weighed (shared OpenSearch, per-app OpenSearch, Aurora pgvector, third party) were the wrong four.
Default taken for now: none. **ADR 0020 was rewritten on the S3 Vectors basis on 2026-09-01**, not merely amended, and its new reasoning leads with correctness rather than cost: with one shared index, isolation depends on every query carrying the right metadata filter, and forgetting it once means one department's protocol answering for another's, silently. The superseded four-option reasoning is summarised there rather than deleted. One thing AWS cannot answer and that could push this back to (a): whether a single vector bucket has a per-bucket index quota. That is a limits question for the console or support.

## Q20 - ADR 0021: how does the KB get read access to each new bucket
Blocks: B4 - without it, ingestion fails. Also decides whether 0006 is seven steps or eight.
Options: (a) one shared role with a statement appended per app; (b) one shared role with a naming-prefix wildcard; (c) a role per app; (d) a bucket policy on each new bucket, role fixed.
Recommendation: (d), with (b)'s prefix as the guard. It keeps the invariant every other step has - a provisioning step writes only resources belonging to its own app - so the IAM work folds into B1, rollback is `delete_bucket`, and the concurrent-create race on a shared policy document disappears.
Default taken for now: none. Nothing IAM-shaped exists in this repo.

## Q21 - ADR 0022: who increments the prompt version, and when
Blocks: B3's artefact name, and whether an answer can be traced to the prompt that produced it.
Options: (a) increment on every write; (b) increment on an explicit publish; (c) content-addressed, `prompt/<sha256>.txt` plus a pointer; (d) no versioning, rely on S3 object versioning.
Recommendation: (c) for the artefact, (b) for the event. A `v1`/`v2` counter in a bucket has no lock, so two simultaneous publishes either collide or silently overwrite. Worth knowing: the version has to be recorded on the conversation turn or none of this achieves its stated purpose, and Gali's turns expire at the next midnight anyway.
Default taken for now: none. Gali has no versioned prompt artefact at all, so accepting this makes app #1 the first thing that would change - which routes straight back into Q17.

## Q22 - ADR 0023: what are the valid uiTemplate values — MODEL DECIDED by EB 2026-09-01 and implemented; only the member's NAME is still open
Blocks: the create form's first field and its validation.
Options: (a) a closed union of built template ids, validated as an enum; (b) a free string with a render-time fallback; (c) a template registry fetched from the backend.
Recommendation: (a), starting with exactly one member. (b) moves the failure from the form, where the creator is present and can fix it, to render time, where the person affected is a patient - an app that looks right in the registry and renders as something else.
Resolved by (a). `UI_TEMPLATE_IDS` is a closed enum with one member, `clinic-rtl`, and `uiTemplate` is `z.enum(UI_TEMPLATE_IDS)`. The value was adopted because it is what **both spec examples use** - the spec's word rather than a guess - and the spec is the source of truth for this repo.
Still yours: **whether `clinic-rtl` is the right name.** Renaming it later is a data migration, because the id lands in every registry row. Also decided and implemented alongside it: colour is a **separate** field, so a palette change is not a template change. See ADR 0023, Q38, Q39, Q42.

## Q23 - ADR 0024: the admin authentication model
Blocks: where the middleware seam goes. Not the implementation - that is out of scope this milestone.
Options: (a) a shared secret or basic auth at the middleware; (b) an OIDC provider with a session cookie; (c) network-level only, VPN or IP allowlist; (d) two roles, editor and admin.
Recommendation: (b) for mechanism plus (d) for model, with only the seam built now. If the factory can edit the knowledge base of a validated medical assistant then "who changed this file" needs an answer, and a shared secret cannot produce one - every action is attributable to everyone.
Default taken for now: none - no middleware file exists yet. Flagged separately, not for this ADR: Gali's own `/chat` and `/history` endpoints have no authorizer at all.

## Q24 - ADR 0025: appName validation, and the fact that it is permanent — MODEL DECIDED by EB 2026-09-01: (b), a derived bucket name
Blocks: the create form's first field, its validation, and its help text.
Options: (a) `appName` is the bucket name verbatim, validated against the full S3 rule; (b) `appName` is a slug and the bucket name is derived, as Gali already does; (c) verbatim plus a pre-flight availability check.
Recommendation: (b). Under (a) an unrelated stranger's bucket named `gali` blocks that app name permanently, and the failure arrives at B1 rather than in the form. Gali's own bucket is `gali-documents-${StackName}-${AccountId}` - app #1 already solved this.
Resolved by (b) - `appName` is a short identifier the creator types and the bucket name is derived from a fixed factory pattern. **The exact pattern and the `appName` rule are Q37**, so the schema still says `z.string().min(1)` and no constant was written: the pattern is a contract.
Now binding rather than advisory: **the create form must say the name can never be changed.** It is both the source of a bucket name and the registry partition key (0007), and neither can be renamed. Recorded as checklist **U17**, including that on an existing app the field is absent and replaced by text rather than disabled - a disabled field still invites the question.

## Q25 - ADR 0026: what does deleting a partial app do
Blocks: the delete confirmation copy and `deleteApp`'s return type.
Options: (a) delete what exists, confirmation generated from real state, per-resource outcome returned; (b) keep the fixed four-resource confirmation and treat absent resources as successes; (c) refuse to delete a partial app until it completes; (d) two operations, delete and abandon.
Recommendation: (a). The confirmation exists to make the operator's model match reality before something irreversible; a dialog listing resources that do not exist teaches them the list is boilerplate, which is exactly what makes the type-the-name safeguard useless. (c) makes an unfinishable app permanently undeletable.
Default taken for now: none. Worth deciding alongside it: the chat table holds patient conversations, and unlike Gali's `Retain` policy an SDK-created table has no protection at all.

## Q26 - ADR 0027: the per-document KB metadata schema — MODEL DECIDED by EB 2026-08-31; the key-by-key split is now proposed
Blocks: 0010, and therefore `dataFiles`.
Options: (a) adopt Gali's 9 keys as the factory schema; (b) a generic five-key core plus a per-app extension; (c) copy all 9 verbatim including the two hard-coded values; (d) no metadata schema.
Recommendation: (b). `gestational_age_max_weeks` is not a property of documents in general - a factory whose universal schema carries a gestational-age field has decided what kind of app it hosts. (c) is defensible if that is the honest answer, and that is your call to make.
Proposed split, awaiting your approval - full reasoning per key in ADR 0027. **Core:** `doc_type`, `topic_tags`, `language`, `source`, `version` (for the first two the *key* is core and the *vocabulary* is app-declared - that turned out to be the load-bearing distinction). **App-specific:** `gestational_age_max_weeks` (your decision), `procedure_type`, `contains_emotional_support`. **Closest call, low confidence: `contains_red_flags`** - proposed core because the spec's own `_FORMAT_AND_FLAGS` already names `[RED_FLAG]`, so escalation is an architecture-level concept; argued against because an app with nothing to escalate to carries a boolean that is false forever. The honest answer may be a third category, *conditionally core*, which the ADR does not currently have.
Answered separately by you and now recorded in 0027: the data-entry person sets the clinical tags in the Data Center, and an agent pass reviews them and **surfaces disagreements to a human rather than overwriting**. That resolves the who-sets-the-booleans objection this question originally raised.

## Q27 - Should the AWS-read KB parameters become constants in lib/gali/constants.ts
Blocks: nothing today. Blocks the KB provisioning step from being written against a single source, and it is how `euclidean` gets forgotten.
Options: (a) yes - add a hand-maintained, AWS-sourced block to `lib/gali/constants.ts` and to the generator, pinned by the golden test like everything else; (b) no - they live in `docs/gali-ground-truth.md` §9 as prose and the recipe quotes them; (c) yes, but in a separate module (`lib/gali/kbConfiguration.ts`) because their provenance is an API read rather than a repo read.
Recommendation: (c). They are exactly the class of value this repo has decided to copy rather than choose - chunking `HIERARCHICAL`, parent 500, child 150, overlap **30**, `cohere.embed-multilingual-v3`, dimension 1024, `float32`, distance metric **euclidean**. But `lib/gali/constants.ts` is generated from Gali's Python source and its header says so, and an AWS-read value cannot be regenerated from that source. Mixing them would make the generator's `--check` lie.
Default taken for now: (b). The values are recorded in `docs/gali-ground-truth.md` §9 with the exact commands that produced them, and `N13`/`N14` in the checklist name the two that change behaviour. No constant was added, because a constant is a contract and its module is a decision.

## Q28 - Does the factory's session identity copy Gali's, including what Gali does not check
Blocks: the chat-history contract and the `/history` equivalent. Not Milestone 1 admin UI. Belongs with 0024.
Options: (a) copy Gali exactly - caller-supplied `session_id` accepted verbatim, `/history` validates UUID format only, no ownership check; (b) copy the generation and tighten the read - server always mints the id, `/history` requires proof of possession beyond knowing the id; (c) copy generation and format, and make the two endpoints agree on the UUID rule without adding authorization.
Recommendation: (b) for new apps, (a) for app #1 unchanged. Read and recorded in `docs/gali-ground-truth.md` §10: the id is a **bearer token with no issuer check** - `/chat` takes it from the request body and uses it verbatim with only `.strip()`, so a caller who learns another session's id can both read that conversation through `/history` and **append turns to it**. It is not enumerable (122 random bits, no listing index, one-day TTL), so the exposure is disclosure rather than guessing - and the id is written to CloudWatch on every turn and echoed in a CORS-exposed `X-Session-ID` header.
Default taken for now: none, and nothing was redesigned - the task was to record the mechanism. Two findings worth your attention independently of the factory: `/history` is unauthenticated and the production frontend never calls it, so the endpoint that turns a leaked id into a full transcript has no known consumer; and because `/chat` accepts non-UUID ids while `/history` rejects them, a session created with such an id can never be read back.

## Q29 - What is the wire name for digestRecipientEmail
Blocks: serializing the field. `AppConfig` and the zod schema carry it now; `app/api/appConfigWire.ts` does not.
Options: (a) `digest_recipient_email`, the snake_case of the TS name per ADR 0008; (b) `recipient_email`, matching Gali's SAM parameter `RecipientEmail`; (c) not in the body at all - the digest is platform concern and the address belongs on the registry row instead.
Recommendation: (a). 0008 fixes the casing convention and there is no spec artefact to defer to, because the spec has no digest at all. (b) borrows a name from a stack parameter that also carries a sender, which the factory does not put in `AppConfig`.
Default taken for now: none. The field exists in TypeScript and in the schema, and is absent from `WireAppConfig` - the mapper still carries exactly the four fields that have a wire name, and a test pins that count.

## Q30 - Must digestRecipientEmail be inside a permitted hospital domain
Blocks: nothing today. Decides whether a creator can send a day of patient conversations to an arbitrary address.
Options: (a) any well-formed address; (b) an allowlist of domains, configured platform-side; (c) an allowlist of exact addresses.
Recommendation: (b). The policy says "a secure hospital address", and format validation cannot tell `wolfson.health.gov.il` from `gmail.com`. A typo in the local part bounces; a typo in the domain delivers a day of clinical conversations to a stranger, and deletion follows a confirmed send.
Default taken for now: (a). `z.email()` validates the format and nothing else, marked BLOCKED in `lib/appConfigSchema.ts` with a pointer here. A domain rule is a data-governance decision, not a format rule.

## Q31 - How long is the chat-history TTL now that deletion follows a confirmed send
Blocks: ADR 0028's core mechanism, and it is coupled to a promise made to patients.
Options: (a) leave it at next midnight Asia/Jerusalem; (b) extend it to a few days, long enough that the backstop fires only after the digest has definitively failed and a human has looked; (c) remove the TTL and rely entirely on post-send deletion.
Recommendation: (b), and the number is yours, not engineering's. (a) defeats the policy - a backstop that fires before the mechanism has run out of chances still destroys unsent conversations, which is exactly today's defect. (c) means a bug in the digest job retains patient data indefinitely, which is worse.
Default taken for now: none, and nothing was changed. **The reason this is yours: Gali's own disclaimer tells the patient "the conversation is deleted after 24 hours and is not kept in the medical file". Lengthening the TTL without changing that sentence makes the product lie to the patient, and changing it is an ethics-committee matter.**

## Q32 - What is the re-ingest control called, and where does it sit
Blocks: Prompt 3, Data Center screen 2. Not the API - draft ADR 0030 settles that the operation is per data source.
Options: (a) a single button above the file list, labelled `הטמעה מחדש של מאגר הידע` (re-ingest the knowledge base); (b) the same button in a per-app header or toolbar, away from the file rows entirely; (c) keep a per-file affordance that explains it re-ingests everything.
Recommendation: (a) or (b), and definitely not (c). With an S3 data source `StartIngestionJob` has no file parameter, so a control on a file row would claim a scope the API cannot honour - and that is the kind of button that gets clicked twenty times. Save stays per file; re-ingest is per app, and the UI should make the asymmetry visible rather than hide it.
Default taken for now: none - no UI exists yet. Recorded so Prompt 3 does not inherit the spec's per-file framing by accident. The Hebrew wording above is a suggestion for `lib/uiStrings.ts`, not a decision.

## Q33 - How is provisioning orchestration implemented
Blocks: the whole provisioning backend. Nothing in Milestone 1 UI, which talks to a mock.
Options: (a) AWS Step Functions Standard; (b) a Lambda orchestrator with its state in DynamoDB and a resume schedule; (c) a CloudFormation stack per app; (d) EventBridge choreography - found and rejected in the comparison, because no single place knows the in-flight state.
Recommendation: (a). Full reasoning in `docs/provisioning-architecture-comparison.md`. The deciding argument is the requirement that motivated the comparison - what happens when the rollback itself fails - and only (a) has a primitive for it: `RedriveExecution` restarts a failed execution **from the failed state**, keeping its history, with `redriveCount` and `PENDING_REDRIVE` visible in `DescribeExecution`. Verified in the service model, not recalled. In (b) that path is code nobody has exercised; in (c) it is a stuck stack and a console session.
Default taken for now: none, nothing implemented. The costs are stated in the document: ASL is a second language in the repo, local end-to-end testing is worse than (b), and Standard billing is per state transition so the poll interval becomes a cost parameter that must be chosen rather than defaulted. Re-examine (c) if either of two things changes - the `DeletionPolicy` trap, where one knob cannot serve both "clean up a failed create" and "never destroy patient conversations"; or the unverified question of whether CloudFormation has resource types for the Bedrock KB, the data source and the S3 Vectors index at all.

## Q34 - Is uploading the kb/ objects a step in its own right
Blocks: the rollback list, and ADR 0006's step count. Not Milestone 1 UI.
Options: (a) a step of its own, making the sequence eight; (b) it folds into the bucket step, which then means "create the bucket and populate it"; (c) it folds into the data source step, since 0030 makes it a precondition of ingestion.
Recommendation: (a). The seven-step list omits it and the spec has it as B2. It creates real resources with their own compensating action, and under 0030 it must complete before ingestion reads the prefix - so a create that fails at the knowledge base strands **objects**, not just a bucket, which is a rollback-list item the seven-step framing loses.
Default taken for now: the comparison document lists it as step **1b** rather than silently renumbering, so no count is asserted. Same ambiguity ADR 0006 is already open about; settle them together.

## Q35 - What detects a create whose rollback never ran at all
Blocks: nothing today. It is the hole ADR 0031 leaves, stated rather than hidden.
Options: (a) a per-execution timeout that forces a terminal state; (b) a scheduled sweeper that finds rows stuck in `provisioning` past a threshold; (c) both.
Recommendation: (c). If the orchestrator dies between the failure and the rollback, the row sits in `provisioning` forever and **neither** terminal state in 0031 is reached, so no operator is ever told. A timeout inside the orchestration cannot cover the case where the orchestration itself is gone - which is exactly the case that needs covering.
Default taken for now: none. Recorded in 0031's Consequences as the one hole it does not close.

## Q36 - Approve the error dictionary, and how hard should ValidationException be parsed
Blocks: the mapping module and the Hebrew copy per code. The shape is already yours; this is the contents.
Options for the parsing sub-question: (a) parse the message to separate `KB_MODEL_UNAVAILABLE_IN_REGION` from `KB_INVALID_CONFIGURATION`; (b) do not parse - one code for every Bedrock `ValidationException`; (c) parse narrowly and fall back to the vague code whenever the match is not unambiguous.
Recommendation: (c). Bedrock returns `ValidationException` for a bad model ARN, a malformed storage configuration and a bad name alike, so the only separator is the message string, which is fragile by construction. A **wrong specific code is worse than a right vague one**, because the UI acts on it and counts are compared across months.
Default taken for now: none, and deliberately no enum was written - the codes are a contract and the ADR is a draft. Provider exception names in the dictionary are extracted from the botocore service models rather than recalled, and the gaps are marked: `CreateBucket` declares only two errors, `DeleteBucket` and `DeleteObjects` declare none at all. That is why `PROVIDER_UNMAPPED` exists.

## Q37 - Approve the bucket pattern, the appName rule, and whether a purpose segment goes in now
Blocks: the `appName` zod pattern, the bucket-name derivation, and the create form's first field. The model is already yours; this is the exact strings.
Options for the pattern: (a) `appfactory-<appName>-<accountId>` as you suggested; (b) `appfactory-<appName>-app-<accountId>`, adding a purpose segment now at a cost of 4 characters of `appName` budget; (c) something else entirely.
Recommendation: (a) for the pattern, with `^[a-z][a-z0-9-]{1,30}[a-z0-9]$` and 3-32 characters for `appName`. Verified: the fixed overhead is exactly **24** characters, so the hard ceiling on `appName` is **39**; recommending 32 leaves 7 characters of deliberate headroom, and the cost is that a creator wanting a 35-character name is refused for a reason invisible to them. Checked against S3 law - no dots so virtual-hosted TLS is safe, begins and ends with letter-or-digit **whatever `appName` is**, and `appfactory-` collides with none of the reserved prefixes.
The sub-question worth your attention: **Gali's own pattern has a purpose segment and this one does not.** Gali is `gali-documents-${StackName}-${AccountId}`. If an app ever needs a second bucket, `appfactory-<appName>-<accountId>` has nowhere to say which bucket it is, and for buckets a pattern change means new buckets. (b) buys that room now; (a) accepts that a second per-app bucket would need its own pattern.
Default taken for now: none - no constant was written, because the pattern is a contract. What the decision already produced without waiting: 0021's recommendation moves from (d) to (b), since a fixed prefix lets the KB read permission be written once with a wildcard between two fixed segments and never amended per app. That is recorded in both ADRs and annotated in the provisioning recipe.

## Q38 - Approve the nineteen colour role names
Blocks: nothing today - they are implemented and tested. But they are a contract: they appear in every scheme, every template, and the CSS variables the browser sees, so renaming one later touches five schemes plus every app's stored custom scheme.
Options: (a) the nineteen as implemented - `surfaceCanvas`, `surfaceRaised`, `surfaceRail`, `surfaceSubtle`, `surfaceBrand`, `surfaceBrandDeep`, `textPrimary`, `textSecondary`, `textMuted`, `textOnBrand`, `textOnBrandMuted`, `textAccent`, `borderSubtle`, `borderDefault`, `borderStrong`, `borderFocus`, `focusRing`, `controlBrand`, `shadowTint`; (b) fewer roles, merging the ones that share a value in Gali (`textAccent` and `focusRing` are both `--sage-600`); (c) more roles, if a template needs distinctions this set cannot express.
Recommendation: (a). The set is derived one-to-one from what Gali's stylesheet actually paints rather than from a generic design-system checklist, and roles that happen to share a value in one scheme should stay separate because another scheme will want them different. Merging them is the cheap-looking change that cannot be undone without a migration.
Default taken for now: (a), implemented in `types/colourScheme.ts` and pinned by tests. The cost is stated in ADR 0023: nineteen values per scheme, so a custom scheme is nineteen colour pickers, and the create form should offer presets first with custom as a deliberate step.

## Q39 - Approve the contrast pair list and which pairs count as large text
Blocks: what the save-time gate actually checks. The nineteen pairs are implemented; the classification of each as normal or large is the part I could not settle.
Options: (a) the list as implemented - thirteen pairs at 4.5:1 and six at 3:1; (b) treat `textMuted` as normal text too, which is stricter and would fail Gali's own muted grey; (c) a shorter list, only the pairs a patient reads.
Recommendation: (a) provisionally, and revisit it when the template exists. **Which text is "large" is a typography fact about a template that has not been built**, so every classification here is a prediction. `textMuted` is the one I am least sure of: it is at 3:1 on the assumption that muted text is timestamps and de-emphasised labels, and if the template uses it for anything a patient must read, it belongs at 4.5:1.
Default taken for now: (a). Nineteen pairs, each carrying a one-line reason so the error message can explain itself. Deliberately not every-role-against-every-role: most combinations never meet on screen, and a guard that flags impossible pairs is a guard people switch off.

## Q40 - What is the wire name for renderPrecedenceText
Blocks: serializing the field. `AppConfig` and the schema carry it; `app/api/appConfigWire.ts` does not.
Options: (a) `render_precedence_text`, the snake_case of the TS name per ADR 0008; (b) inside `sp_sections` as a sixth key, since it affects only the prompt; (c) a separate `prompt_options` object, if more prompt-level switches are expected.
Recommendation: (a). ADR 0009 rejected a sixth prompt part explicitly, and the strict schema already rejects a sixth key in `systemPrompt` - a test pins that. (c) is speculative until there is a second switch.
Default taken for now: none. The field exists in TypeScript and in the schema and is absent from `WireAppConfig`, which still carries exactly the four fields that have a wire name.

## Q41 - Gali's own palette fails WCAG 2.1 AA in four places
Blocks: nothing in this repo. Raised because it was found while extracting the palette and it is a live accessibility defect in a production medical system, not a factory question.
The finding, computed from `Gali-frontend/src/index.css`: `--sage-600` (`#4a8b7a`) is used only at 10-11px - eyebrow labels, the ornament rule, the copy action - so 4.5:1 applies, and it measures **3.99** on white, **3.76** on `--bone-50`, **3.60** on `--sage-50`. Separately, `--sage-400` as the composer's focused border measures **1.98** on white against the 3:1 a UI component needs, with an accompanying focus ring of `rgba(45,90,76,0.12)` that is fainter still. Keyboard focus is fine - `:focus-visible` uses `--sage-600` at 3.99:1, which clears 3:1.
Options: (a) fix Gali - darkening `--sage-600` to about 4.5:1 on white fixes three of the four at one value, and the focus border needs its own value; (b) leave Gali and fix only the factory's schemes; (c) leave both.
Recommendation: (a) for the accent, because it is one value and it affects every small label in the product. The focus border is the more serious of the two in practice - a focused input at 1.98:1 is close to invisible - but changing it touches a validated system, so it is your call and the committee's.
Default taken for now: nothing changed in Gali, and nothing invented in the factory. `gali-sage` ships Gali's values unaltered, the four failures are asserted by a characterisation test so they cannot be quietly forgotten, and the contrast gate applies to custom schemes only - gating the preset would make app #1 uncreatable by the factory built to create it.

## Q42 - Does the chat template need status colours, and a dark scheme
Blocks: the role set, if the answer to either is yes. Both were left out deliberately rather than guessed.
Options: (a) neither - nineteen roles, all-light schemes; (b) status colours only; (c) a dark scheme only; (d) both.
Recommendation: (a) until something needs otherwise. On status colours: Gali has **none** to copy - verified, the frontend has no hex literals, no colour class outside the two scales, no `rgba()`, and every SVG uses `currentColor`, and its one error path renders as an ordinary assistant bubble. Inventing an error red would be guessing a value that must match Gali. The factory's own admin UI is not themed by these schemes, so its error rendering is not blocked. On dark: a dark scheme is not a recolour, it inverts which roles are light, so it is a template question as much as a palette one.
Default taken for now: (a). Nothing is blocked by the omission; a template that wants an error colour will make this concrete, and that is a better time to choose one.

## Q43 - What is the real textPromptTemplate limit: 4000, 4096, or higher
Blocks: nothing today, and it undermines the confidence of three artefacts - ADR 0016, `docs/gali-five-parts-draft.md`, and the headroom arithmetic everywhere the cap is cited.
The problem: **the three authorities disagree.** Gali's code asserts `<= 4096` at `shared/shared/prompt.py:409`. The `bedrock-agent-runtime` service model declares the field Gali passes - traced, not assumed, to `TextPromptTemplate` - as **max 4000**. Production sends **4064** and works. The other template shape in the same model, `BasePromptTemplate`, does allow 100000, but it is referenced only by the agent-orchestration path and not by RetrieveAndGenerate.
Options: (a) the model's 4000 is stale and the real limit is 4096 or higher, so nothing changes; (b) the limit is 4000, documented but unenforced server-side, and app #1 is 64 characters over it on borrowed time; (c) the limit is enforced somewhere in between.
Recommendation: settle it by experiment, because it is cheap and no amount of reading resolves a three-way disagreement. Send `textPromptTemplate` at 4000, 4064 and 4097 characters against a scratch KB and see which are refused. Routed as Group C in the provisioning recipe.
Default taken for now: **nothing changed.** The constant stays 4096 in `lib/gali/constants.ts`, because that file records what Gali asserts and is generated from Gali's source - lowering it would assert a number production contradicts, and raising the model's number would assert one AWS denies. ADR 0016 carries a dated note, the five-parts draft carries a caveat, and the ground truth says so at the point where the 4064 is stated. If the answer is (b), the ADR 0009 precedence flag is not merely tight for Gali but impossible, and the five-part draft at 4047 is over rather than under.
Surfaced by the parallel production investigation in `docs/gali_readonly_audit_2026-09-01.md` and verified independently here against the service model.

