# Architecture checklist

Derived from `docs/app-factory-architecture.html`, read in full — map, services
cards, live flow (`FLOW` data, F1–F4 and B1–B7), system-prompt section (`SP`
data), and the Open section. Cross-checked against
`app-factory-claude-code-prompts.md`.

Status vocabulary:

| status | meaning |
| ------ | ------- |
| `spec` | fully determined by the spec, nothing to decide |
| `conflict` | the spec and the build plan disagree, or the spec disagrees with itself — ADR open |
| `TBD` | marked TBD by the spec — ADR open |
| `gap` | needed by the system, absent from the spec, not marked TBD |
| `settled` | an ADR has decided it — the ADR number follows |
| `gali` | contradicted or answered by the production Gali code, read 2026-08-23 |
| `aws` | contradicted or answered by reading the live AWS resources, 2026-08-31 — the KB was built in the console, so this is the only source for its configuration |
| `M1` | in scope for Milestone 1 |
| `later` | in the spec, out of Milestone 1 |

Two ADRs have been accepted since this checklist was first written (0008, 0009),
0007 is partly settled, and Prompt 0 step 1c/1d has now read both Gali repos. Rows
below carry `settled` or `gali` where that changed the status.

---

## 1. Components

| # | Component | Lane | What it owns | Status |
| - | --------- | ---- | ------------ | ------ |
| C1 | Admin Dashboard | UI | The only place an app is born or removed. Create, edit data center, delete. | `spec` `M1` |
| C2 | Dev Dashboard | UI | Monitoring (traffic, errors, ingestion status per app) and deploy (one app or all). | `spec` `later` |
| C3 | Data Center | UI | Renders the markdown files, edits them, re-embeds file by file. | `spec` `M1` |
| C4 | Provisioning service | API | Consumes one config JSON, runs the creation steps in fixed order, returns resource ids. Owns naming. | `spec` `later` |
| C5 | BFF route handlers (`app/api`) | UI server | Thin proxies: validate, call API Gateway, normalise errors. Auth seam. | build plan, not in spec — `M1` |
| C6 | Local mock backend | UI | `factoryApi.mock.ts` over localStorage, artificial latency, forced-failure switch, discrete create states incl. partial. | build plan, not in spec — `M1` |

## 2. AWS resources, per app

| # | Resource | Named parameters the spec fixes | Status |
| - | -------- | ------------------------------- | ------ |
| R1 | S3 bucket | Named after the app. Created **first**, because everything else points at it. Holds the markdown files = source of truth. | `spec` |
| R2 | `kb/` prefix in the bucket | One markdown file per data section, e.g. `kb/prep.md`. The Data Source points here. | `spec` |
| R3 | `prompt/v1.txt` in the bucket | The composed system prompt, saved **as a version**, so you can tell which prompt produced a given answer. | `spec` |
| R4 | Bedrock Knowledge Base | chunking `hierarchical`; parent `500` tokens; child `150` tokens; embeddings `cohere.embed-multilingual-v3`; dimensions `1024`. Fixed for every app. | `aws` — **all five CONFIRMED against KB `CHAU7BWP4S` on 2026-08-31.** One placement correction: 1024 is a property of the vector index, not of the KB — `get-knowledge-base` returns no dimension field. Production also sets four things the spec never mentions: `overlapTokens: 30` (`N13`), `distanceMetric: euclidean` (`N14`), `FLOAT32`, `dataDeletionPolicy: DELETE`. See `docs/gali-ground-truth.md` §9. |
| R5 | Bedrock Data Source | `source = s3://<app>/kb/` | `gali` — **Gali's KB uses a CUSTOM data source, not S3.** Markdown is pushed with `IngestKnowledgeBaseDocuments` (`scripts/ingest_kb.py`). The spec describes a mechanism app #1 does not use. → **0018**. `aws` 2026-08-31: `dataSourceConfiguration.type: CUSTOM` confirmed on `PPIUPPCKNN`, and `list-data-sources` returns exactly one data source — `FDN4IETFFW`, the id `samconfig.toml` passes to the sync Lambda, **does not exist**. Recorded, not acted on; see QUESTIONS.md Q1. |
| R6 | Ingestion job | Turns files into vectors. The longest step. Asynchronous. | `gali` — CUSTOM ingest is a per-document upsert keyed on document id, not a data-source-wide job. Changes `E8` feasibility, and **resolves it**: per-document upsert makes per-file re-embedding achievable. → **0018**. |
| R7 | DynamoDB chat-history table | name `<app>-chat`; key `session_id`, generated client-side; TTL attribute `expires_at`, 24h. No user accounts. | `gali` — every detail but the client-generated key differs in production: name `gali-sessions-${Stage}`, **composite** key `session_id` HASH + `timestamp` RANGE, TTL attribute **`ttl`**, expiring at next midnight Israel time rather than rolling 24h. Sort key `timestamp = 0` is reserved for the Bedrock session pointer. → **0018**. |
| R8 | Subdomain | `<app>.<factory-domain>`, probably CNAME → app endpoint. Last step. | `TBD` → 0012 |
| R9 | Certificate | Issuer and mechanism undecided. | `TBD` → 0012 |

## 3. Platform resources, one instance

| # | Resource | Notes | Status |
| - | -------- | ----- | ------ |
| P1 | Factory registry table (DynamoDB) | The one table that knows which apps exist. One row per app. Both dashboards read from it. **Without the row an app is invisible even if its resources exist.** | `spec` |
| P2 | API Gateway | SAM-deployed. Reached only through the BFF. | build plan |
| P3 | Region | `eu-west-1` appears once, inside an illustrative `create_bucket` sample. Never stated as a decision. | `gali` — `eu-west-1` in production: `shared/shared/config.py` `BEDROCK_REGION` default, `scripts/ingest_kb.py` `REGION`, and the frontend's fallback API URL. Consistent everywhere, still never written down as a factory decision. |
| P4 | KB vector store | A Bedrock KB requires a vector store (OpenSearch Serverless, Aurora, Pinecone…). Never mentioned. Affects both create cost and B4 rollback. | `aws` — **`S3_VECTORS`**, index `bedrock-knowledge-base-ib3awf/bedrock-knowledge-base-default-index`, read 2026-08-31. Invisible to the repo, readable from the API. Not one of the four options draft ADR 0020 considered, and it removes 0020's cost argument: S3 Vectors has no minimum billed capacity. → **0020, amended**. |
| P5 | IAM role for KB → S3 | The KB needs read access to each new bucket. Never mentioned; a candidate for the missing step in 0006. | `aws` — role `AmazonBedrockExecutionRoleForKnowledgeBase_dvica` read 2026-08-31. It has **no `s3:GetObject` and no `s3:ListBucket` at all**, because a CUSTOM data source is pushed to rather than read from. So the question is real for the factory's S3 data source and does not arise for app #1. → **0021**. |
| P6 | Admin authentication | Build plan requires a marked middleware seam, no implementation. Spec is silent on who may create or delete an app. | `gap` `M1` (seam only) |

---

## 4. Flow steps — frontend

| # | Step | What happens | Status |
| - | ---- | ------------ | ------ |
| F1 | Name & template | Creator picks app name and a ready UI template. The name becomes the key for every other resource, chosen once. | `spec` `M1` |
| F2 | Rules & SP sections | Creator writes the rules and the five prompt sections. Generic files — same structure every app, only content changes. | `settled` 0009 — rules live in both lanes: `_RULES` is one of the five parts and holds binding constraints; elaboration is `kb/` markdown. Not a top-level field. |
| F3 | Build the data | Data entered in a defined structure, not free text. Each section becomes one markdown file — which is what makes single-file re-embedding possible. | `TBD` → 0010 |
| F4 | Hand off | Everything packed into one JSON, `POST /apps` → `202 accepted`. Frontend then only waits for resource ids. | `conflict` → 0014 |

## 5. Flow steps — backend, and their compensating actions

Spec says seven in one place, six in another; the flow data contains seven.
See 0006.

| # | Step | Creates or mutates | Compensating action | Status |
| - | ---- | ------------------ | ------------------- | ------ |
| B1 | `create_bucket` | S3 bucket named after the app | `delete_bucket`, only after emptying | `spec` |
| B2 | `put_object` × N → `kb/` | the markdown knowledge files (and rule files?) | `delete_objects` for every key written | `spec` / `conflict` on rules → 0009 |
| B3 | Assemble SP | `prompt/v1.txt` — the five parts concatenated in fixed order | `delete_object`; with versioning, the version | `spec` |
| B4 | KB + DS + ingestion | Bedrock KB, Data Source, vector index, embeddings | stop job → `delete_data_source` → `delete_knowledge_base`; vector store may survive | `spec`, rollback `TBD` → 0013 |
| B5 | `create_table` | DynamoDB `<app>-chat` | `delete_table` | `spec` |
| B6 | `put_item` | one factory-registry row — the app becomes real here | `delete_item` | `spec` |
| B7 | Subdomain | DNS record + certificate | undefined until the record type is chosen | `TBD` → 0012 |

## 6. Named fields — `app.config.json` / request body

Spec names on the left, build-plan names on the right where they differ.

| # | Field (spec) | Field (build plan) | Notes | Status |
| - | ------------ | ------------------ | ----- | ------ |
| A1 | `app_name` | `appName` | The key tying bucket, table and registry row together. Also the registry partition key (0007) and the bucket name, so `N8` governs its validation. | `settled` 0008 |
| A2 | `ui_template` | `uiTemplate` | Which chat UI template the app renders. | `settled` 0008 on naming; the set of valid values is still `gap` (`N6`) |
| A3 | `language` | — | In `app.config.json` at F1 (`"he"`). Absent from `AppConfig`. Overlaps `_LANGUAGE`. | naming `settled` 0008; **membership still open** — one field or two is not decided |
| A4 | `sp_sections` | `systemPrompt` | Container for the five parts. `snake_case` on the wire, `camelCase` in TS. | `settled` 0008 |
| A5 | `rules` | (inside `systemPrompt`) | One of the five parts, authored as a list, joined for the prompt. **Not** a top-level sibling. | `settled` 0009 |
| A6 | `data_sections` | `dataFiles` | `{ id, title, body_md }` vs `{ path, body }`. Is `path` derived from `id`? Where does `title` go? | naming `settled` 0008; **shape still** `TBD` → 0010, and see `N10` for what Gali actually requires |
| A7 | — | `disclaimers` | In no spec JSON. Format and storage undecided. | `TBD` → 0011 |

## 7. Named fields — system prompt parts

Order is identical in both sources and is the one thing not in dispute.

| # | Part (spec) | Part (build plan) | Content | Status |
| - | ----------- | ----------------- | ------- | ------ |
| S1 | `_IDENTITY` | `identity` | Domain, audience, what is out of scope. Varies most between apps. | `settled` 0008 |
| S2 | `_LANGUAGE` | `language` | Answer language, direction, handling of other-language questions. | `settled` 0008 |
| S3 | `_VOICE` | `voice` | Tone, length, distance. | `settled` 0008 |
| S4 | `_RULES` | `rules` | Binding constraints only, authored as a list, joined for the prompt. Elaboration goes to `kb/`. | `settled` 0009 |
| S5 | `_FORMAT_AND_FLAGS` | `formatAndFlags` | Output shape, plus machine-read flags `[REFERRAL]` `[RED_FLAG]` `[OUT_OF_SCOPE]`, never shown. | `settled` 0008. Note `gali`: Gali emits no such flags — its equivalents are bracketed *inbound* per-turn directives injected into the query, and `[SHOW_DEFAULT_DISCLAIMER]`. |
| S6 | join order | `composeSystemPrompt` | Identity → language → voice → rules → format. Fixed. One module only. | `spec` `M1`, confirmed `gali` (`prompt.py:293`) |
| S7 | separator | — | What joins the parts. | `gali` — **the empty string.** `SYSTEM_PROMPT = _IDENTITY + _LANGUAGE + _VOICE + _RULES + _FORMAT_AND_FLAGS`; each part carries its own trailing `\n\n`. Recorded in 0009. |
| S8 | prompt versioning | — | `prompt/v1.txt` implies v2, v3. Who increments, and when, is never stated. | `gap` — and Gali has no versioned prompt artefact at all; the prompt is a Python literal in the Lambda layer, versioned by git. |
| S9 | the composed prompt is not the live prompt | — | `gali` — Gali's five-part `SYSTEM_PROMPT` is documentation. Production sends `RAG_PROMPT_TEMPLATE`, a separately hand-written condensed string, **hard-capped by Bedrock at 4096 characters** and required to contain `$search_results$`. The spec's central claim — *"the system prompt is assembled, not written"* — is not true of app #1. | `gali` → **0018** |

## 8. Named fields — factory registry row

| # | Field (spec B6) | Field (build plan) | Status |
| - | --------------- | ------------------ | ------ |
| G1 | `ui_id` (`"clinic-rtl"`) | `uiId` | `settled` 0007 — an ordinary attribute holding the UI template name. Not a key, not unique per app. |
| G2 | `app_name` | `appName` | `settled` 0007 — **the partition key.** |
| G3 | `dynamo_id` (`"gali-ivf-chat"`) | `dynamoTableId` | `settled` 0007 — stored as **`dynamo_table_id`**, not the spec's `dynamo_id`. |
| G4 | `kb_id` (`"CHAU7BWP4S"`) | `knowledgeBaseId` | `settled` 0007 — stored as **`knowledge_base_id`**. Note `gali`: `CHAU7BWP4S` is not a placeholder — it is Gali's real production KB id, hard-coded at `scripts/ingest_kb.py:32`. |
| G5 | `created_at` (ISO 8601) | — | `settled` 0007 — it is in the row. |
| G6 | partition key | `app_name`. Cannot be changed later without rebuilding the table. | `settled` 0007 |
| G7 | provisioning state | — | The App list must show `complete` / `partial` / `failed`. Nothing in the row carries it. | `gap` → 0013 |
| G8 | subdomain / address | — | No field for the app address anywhere in the row. | `gap` → 0012 |

## 9. Named fields — chat history table

| # | Field | Notes | Status |
| - | ----- | ----- | ------ |
| H1 | `session_id` | Partition key, generated client-side. No user accounts. | `spec` |
| H2 | `expires_at` | TTL attribute, 24h. | `spec` |
| H3 | message payload | The shape of a stored turn is never described. Milestone 1 does not need it. | `gap` |

## 10. API surface

| # | Operation | In the spec? | Status |
| - | --------- | ------------ | ------ |
| E1 | `POST /apps` → `202` | **Yes — the only route the spec names.** | `spec`, semantics `conflict` → 0014 |
| E2 | `listApps()` | Implied by "both dashboards read from here". No route. | `gap` → 0015 |
| E3 | `createApp(config)` | E1, but the build plan has it return ids, which `202` cannot. | `conflict` → 0014 |
| E4 | `deleteApp(appName)` | Implied by the teardown description. Returns `void`, which cannot express partial teardown failure. | `gap` → 0015 |
| E5 | `listFiles(appName)` | Implied. No route. | `gap` → 0015 |
| E6 | `readFile(appName, path)` | Implied. No route. `path` traversal constraints undefined. | `gap` → 0015 |
| E7 | `writeFile(appName, path, body)` | Implied. No route, no concurrency/etag story. | `gap` → 0015 |
| E8 | `reembedFile(appName, path)` | Implied, and the spec insists save and re-embed are distinct actions. | `gap` → 0015 on the route. **Feasibility, final answer → 0030:** per-file re-embedding is achievable *only* via a CUSTOM data source, and the factory chooses **S3** (0030). `StartIngestionJob` takes no document, file, key or prefix parameter, so with an S3 source there is nowhere to name a file. `E8` therefore becomes `reingestKnowledgeBase(appName)` — an operation on the data source, not on the file row. The control label and placement are queued as Q32. |
| E9 | `getIngestionStatus(appName, jobId)` | Implied by "show ingestion status including pending". | `gap` → 0015 |
| E10 | provisioning status | Not in the spec and **not in the proposed surface** — but the App list cannot show `complete`/`partial`/`failed` without it. | `gap` → 0014, 0015 |
| E11 | delete file | Nothing removes a knowledge file. | `gap` → 0015 |
| E12 | `getApp(appName)` | Data Center screens all work on one app; reading one row via `listApps()` is a scan. | `gap` → 0015 |
| E13 | monitoring / deploy | Dev Dashboard. No operations described. | `later` |
| E14 | normalised error shape | "Normalise errors" is a stated handler duty with no defined format. | `gap` → 0015. Prior art `gali`: `shared/shared/responses.py` — `{"error": "<message>"}`, `Content-Type: application/json; charset=utf-8`, one helper so handlers cannot drift. |

## 11. UI requirements from the build plan

| # | Requirement | Status |
| - | ----------- | ------ |
| U1 | `app/layout.tsx` sets `lang="he"` `dir="rtl"`, loads the fonts Gali uses | `M1` |
| U2 | RTL is the primary layout direction, not an afterthought | `M1` |
| U3 | All Hebrew user-facing strings in one module | `M1` |
| U4 | No business logic in components — hooks and services only | `M1` |
| U5 | No invented design system — read Gali components, report inherited conventions, then style | `M1`, needs the Gali read |
| U6 | App list: appName, KB id, Dynamo id, provisioning state; must not imply the list is the resources; empty state is the normal first view | `M1`, blocked partly by 0007/0013 |
| U7 | Create app: stepped form → exactly one validated `AppConfig`; five SP parts as five labelled fields; live read-only composed preview the user never types into | `M1`, blocked by 0008/0009 |
| U8 | Delete app: confirmation naming all four resources destroyed, app name typed to confirm | `M1`, and 0012 may make it five |
| U9 | Data Center screen 1 — file list for a selected app | `M1` |
| U10 | Data Center screen 2 — editor; save and re-embed as two distinct actions; ingestion status including pending | `M1`. → **0030**: still two actions, but their **scope differs** — save is per file, re-ingest is per app. One ingestion job per app at a time, so `pending` is a property of the app and the status UI gets simpler, not harder. Label and placement queued as Q32. |
| U11 | Data Center screen 3 — new file from rule-based structure | **blocked** → 0010 |
| U12 | UI copy carries the principle: content fixes are made in the markdown file and re-ingested, never patched into a prompt | `M1` |
| U13 | Server Components by default, `"use client"` marked deliberately | `M1` |
| U14 | Mock renders a half-created app from day one, not as a bolted-on edge case | `M1` |
| U15 | README notes that a static export is impossible | `M1` |
| U16 | Create app: live character count of the **composed** prompt against the 4096 cap, and save is blocked above it. `composeSystemPrompt` fails rather than truncating. | `M1`, → 0016. **Not in the spec or the build plan** — the cap is a Bedrock service limit found by reading Gali. |

## 12. Open items — the full TBD set

| # | Item | Source | ADR |
| - | ---- | ------ | --- |
| T1 | Subdomain record type and certificate issuance | spec Open + TBD service card + B7 | 0012 |
| T2 | Disclaimer format and storage location | spec Open | 0011 |
| T3 | Data file structure a creator must supply | spec Open + F3 + Data Center card | 0010 |
| T4 | Rollback ownership when a create step fails after the bucket exists | spec Open | 0013 |
| T5 | Backend step count, seven vs six | spec internal contradiction | 0006 |
| T6 | Registry row field names, casing, and key | spec vs build plan | 0007 — partly settled; two attribute names remain |
| T7 | `AppConfig` field names and casing | spec vs build plan | 0008 — **accepted** |
| T8 | Where `rules` live | spec vs itself | 0009 — **accepted** |
| T9 | `createApp` async vs synchronous ids | spec vs build plan | 0014 |
| T10 | `factoryApi` route shapes and error shape | spec silent | 0015 |

## 13. Not in the spec, needed anyway

| # | Item | Why it matters |
| - | ---- | -------------- |
| N1 | Region (`P3`) | Answered by Gali: `eu-west-1` throughout. Still needs stating as a factory decision, since bucket names and endpoints depend on it. **Drafted as 0019.** |
| N2 | KB vector store (`P4`) | **Answered 2026-08-31 by reading AWS: `S3_VECTORS`.** A Bedrock KB cannot exist without a store; app #1's is an S3 Vectors index, not OpenSearch Serverless. Still a factory decision — shared index or one per app — so 0020 stays a draft, amended with the real store and without its OpenSearch cost argument. |
| N3 | IAM role, KB → S3 (`P5`) | Required for ingestion. Candidate missing step in 0006. **Drafted as 0021**, which recommends a bucket policy so no eighth step is needed. |
| N4 | Prompt part separator (`S7`) | Answered by Gali: the empty string. Recorded in 0009. |
| N5 | Prompt version increment policy (`S8`) | `prompt/v1.txt` implies successors. Gali has no versioned prompt artefact. **Drafted as 0022.** |
| N6 | Valid `ui_template` values (`A2`) | The create form's first field is a choice from a set nobody has enumerated. **Drafted as 0023.** |
| N7 | Admin auth model (`P6`) | Seam only this milestone, but the model decides where the seam goes. **Drafted as 0024.** |
| N8 | S3 bucket naming constraints | Bucket names are globally unique, lowercase, DNS-safe. `appName` is used verbatim as the bucket name, so `appName` validation in the zod schema is really S3 naming law, and a name collision is a create failure nobody has assigned an error message to. **Drafted as 0025**, coupled to 0007: `appName` is the bucket name AND the DynamoDB partition key, so the create form's first field is validated by S3 naming law and is permanently immutable. |
| N9 | Delete semantics for a partial app | The delete confirmation names four resources. A partial app has fewer than four. **Drafted as 0026.** |
| N10 | Per-document KB metadata schema | `gali` — Gali validates every KB document against a required 9-key schema before any network call: `doc_type`, `procedure_type`, `gestational_age_max_weeks` (optional), `topic_tags` (1–10 non-empty strings), `contains_red_flags`, `contains_emotional_support`, `language`, `source`, `version`. This is the real answer to *"a defined structure, not free text"* and it is absent from the spec and from `AppConfig`. Feeds 0010. **Drafted as 0027**, and it feeds 0010. Copied verbatim into `lib/gali/constants.ts`. |
| N11 | The 4096-character prompt cap (`S9`) | **Settled by 0016.** A hard Bedrock limit on the RetrieveAndGenerate prompt template. `composeSystemPrompt` validates and fails; the create form counts and blocks. See `U16`. |
| N13 | Chunk overlap | `aws` — production sets `overlapTokens: 30` on the hierarchical chunking config. The spec names three chunking numbers and not this one, so a factory built from the spec would create a KB that chunks differently from app #1. Needs to become a factory constant. |
| N14 | Vector distance metric | `aws` — the S3 Vectors index uses **`euclidean`**. Nothing in the spec, the build plan or any ADR mentions a distance metric, and cosine is the more common default for text embeddings. Wrong metric = different retrieval on identical vectors, with no error to notice. Needs to become a factory constant. |
| N12 | Disclaimers already exist in Gali, twice | `gali` — as `data/Disclaimers 210626.md`, an ingested KB document with `doc_id="disclaimers"`, **and** as prompt text with frequency rules in `_FORMAT_AND_FLAGS`. Both lanes, which is a data point for 0011, not a decision. |
