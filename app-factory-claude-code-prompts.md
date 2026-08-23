# App Factory - Claude Code prompts

**Repo:** `C:\Users\eb300\Desktop\App_Factory` -> `https://github.com/EB-WildEye/App_Factory.git`
**Reference:** the working Gali repo, read-only
**Stack:** Next.js (App Router) + React + Bun + TypeScript + Tailwind, RTL Hebrew
**API shape:** BFF - browser talks only to Next route handlers, which proxy to API Gateway
**IaC:** SAM, not touched in this milestone
**Milestone 1:** Admin Dashboard + Data Center UI. The GUI is built first and its
output becomes the spec for everything behind it.

Paste these one at a time. Do not run prompt N+1 before reviewing N.

---

## Standing rules (put this in CLAUDE.md at the repo root)

```
CONTEXT
This repo is "App Factory": a platform that provisions a complete chat
application (S3 bucket, Bedrock Knowledge Base + Data Source, DynamoDB history
table, subdomain) from a config form filled in by a creator. App #1 will be an
existing production chatbot called Gali.

The architecture is specified in docs/architecture.html. It is the source of
truth for this project. Read it before answering any structural question. When
this file and your own instinct disagree, the file wins and you raise the
conflict with me.

Gali is split across two separate repos, both available READ-ONLY:
  backend   C:\Users\eb300\Desktop\Gali-AWS-backend
  frontend  C:\Users\eb300\Desktop\Gali-frontend
It is a working production system under an ethics-committee validation freeze.

HARD RULES
1. Never write to, edit, or stage anything under the Gali path. Read only.
2. Do not copy Gali source files wholesale into this repo. Read Gali to learn
   shapes and conventions, then write new code here.
3. This milestone is the GUI. No AWS SDK calls, no SAM template, no provisioning
   logic. The backend does not exist yet and we are not pretending it does. We
   are defining the contract it will have to satisfy.
4. When a decision is not determined by the prompt or by docs/architecture.html,
   STOP and ask. Do not pick a default and continue. This applies especially to
   schema field names, route shapes, and anything the architecture marks TBD.
5. Hebrew RTL is the primary layout direction, not an afterthought.
6. Next.js App Router. Server Components by default; mark interactive surfaces
   "use client" deliberately, not reflexively.
```

---

## Prompt 0 - repo, spec ingestion, and the config contract

```
Task: initialize the App Factory repo and extract the build contract from the
architecture spec.

STEP 1 - read and report, write no code
a) Read docs/architecture.html in full and produce docs/architecture-checklist.md:
   every component, every resource, every named field, and every item the spec
   marks TBD, as a flat checklist with a status column.
b) The spec counts the backend steps two different ways: the services section
   says seven steps in fixed order, the live CREATE walkthrough says six. Do not
   try to pick the nicer number. Instead enumerate every step that creates or
   mutates a real AWS resource, and for each one state what compensating action
   would undo it. Then tell me whether the discrepancy is the TBD subdomain step
   being excluded or a step that exists in reality and is missing from the count.
   A resource-creating step that no count knows about becomes an orphan nobody
   deletes. Report and ask - do not resolve it yourself.
c) Read Gali-frontend and report: exact dependency versions, how RTL is
   configured, the shape of src/types.ts and src/services/apiService.ts.
d) Read Gali-AWS-backend and report only what this milestone needs: the SAM
   template's API routes and their request/response shapes, and where the KB id,
   Dynamo table name and system prompt are currently hard-coded. Those hard-coded
   values are exactly what becomes AppConfig later. Do not design the
   generification now - just list them.
Then STOP and wait for approval.

STEP 2 - after approval, scaffold
- Next.js App Router project with Bun as package manager and runtime,
  TypeScript, Tailwind. Bun scripts, bun.lockb committed.
- app/layout.tsx sets lang="he" dir="rtl" and loads the fonts Gali uses.
- git init, initial commit, remote origin
  https://github.com/EB-WildEye/App_Factory.git, do not push without asking.
- .gitignore covering .next, node_modules, .env*.

STEP 3 - the config contract
- types/appConfig.ts defining AppConfig: the JSON the create form produces and
  the provisioning backend consumes. Per the architecture:
    appName        the key tying bucket, table and registry row together
    uiTemplate     which chat UI template the app renders
    systemPrompt   exactly five named parts: identity, language, voice, rules,
                   formatAndFlags, concatenated in that fixed order
    dataFiles      the markdown knowledge files, each with path and body
    disclaimers    TBD in the spec - type the field, comment it as unresolved
- A zod schema for AppConfig plus one exported serializer to backend JSON.
- lib/composeSystemPrompt.ts as a pure function taking the five parts and
  returning the string. It is the ONLY place the parts are joined. Nothing else
  in the codebase concatenates a prompt.

STEP 4 - tests
Bun test (or Vitest, tell me which you picked and why) covering
composeSystemPrompt part order and missing-part failure, and the zod schema
rejecting an empty appName and unknown fields.

No UI in this prompt.
```

---

## Prompt 1 - the seam the backend will have to fill

```
Task: define the API surface the provisioning backend must implement, and back
it with a local mock so the GUI runs today.

DECIDED - option B, BFF. Do not re-open this:
All backend calls go browser -> Next route handler under app/api -> the SAM API
Gateway. The browser never holds an AWS endpoint, key, or credential. Nothing
backend-related is ever exposed through a NEXT_PUBLIC_ variable. Consequences you
must respect:
- services/factoryApi.ts runs client-side and fetches RELATIVE paths only.
- One route handler per operation under app/api, each a thin proxy: validate
  input with the zod schema, call API Gateway, normalize errors. No business
  logic in the handlers.
- Admin authentication is enforced at the route-handler layer. Do not build auth
  now; leave one clearly marked middleware seam where it will go.
- This makes the Next server a real deployment artifact. A static export
  (output: 'export') is now impossible. Note that in the README.

Create services/factoryApi.ts as the ONLY module that talks to the backend.
Typed, async. Proposed surface - check it against docs/architecture.html and
tell me what is missing or wrong before implementing:

  listApps()                          -> registry rows
  createApp(config: AppConfig)        -> created resource ids
  deleteApp(appName)                  -> void
  listFiles(appName)                  -> markdown file list
  readFile(appName, path)             -> file body
  writeFile(appName, path, body)      -> void
  reembedFile(appName, path)          -> ingestion job handle
  getIngestionStatus(appName, jobId)  -> status

A registry row per the spec is: uiId, appName, dynamoTableId, knowledgeBaseId.

Then services/factoryApi.mock.ts implementing the same interface against
localStorage, with artificial latency and a switch to force any call to fail.
Real and mock interchangeable behind NEXT_PUBLIC_USE_MOCK_API.

The mock's createApp must model the backend steps as discrete states including
partial failure. The spec says the bucket is created first because everything
else points at it, and that a failure mid-sequence leaves orphans. So the GUI
must be able to render a half-created app from day one, not as an edge case
bolted on later.
```

---

## Prompt 2 - Admin Dashboard

```
Task: build the Admin Dashboard. Per the architecture it is the only surface
where an app is born or deleted.

Screens:
1. App list - reads the factory registry through factoryApi. Row shows appName,
   KB id, Dynamo id, provisioning state (complete / partial / failed). The spec
   notes an app with no registry row is invisible even if its resources exist -
   make sure the UI does not imply the list is the resources. Empty state is the
   normal first view.
2. Create app - a stepped form producing exactly one validated AppConfig:
   name + UI template, then the five system-prompt parts as five separate
   labelled fields, then the data files. Live read-only preview of the composed
   prompt from composeSystemPrompt. The user never types into the preview.
3. Delete app - confirmation naming all four resources that get destroyed
   (bucket, KB + data source, DynamoDB table, registry row), requiring the app
   name typed to confirm.

Constraints:
- All Hebrew user-facing strings in one module.
- No business logic in components; hooks and services only.
- Do not invent a design system. Read the Gali frontend components first, report
  the conventions you are inheriting, then style.
```

---

## Prompt 3 - Data Center UI

```
Task: build the Data Center. Per the architecture this is where the knowledge
actually lives, in a form a human can read.

Screens:
1. File list for a selected app - the markdown files in that app's bucket.
2. File editor - edit one file, save, then re-embed THAT FILE ONLY. Save and
   re-embed are two distinct user actions. Show ingestion status including
   pending.
3. New file - built from a rule-based structure, NOT a free-text editor. The
   structure rules are TBD in the spec. Build screens 1 and 2, then stop and ask
   me for the rules before starting screen 3.

Principle to carry into the UI copy: content fixes are made in the markdown file
and re-ingested, never patched into a prompt.
```

---

## Open in the spec - do not let Claude Code decide these

- Subdomain record type (CNAME or other) and certificate issuance
- Disclaimer format and storage location
- The data-file structure a creator must supply before an app can be created
- Rollback ownership when a create step fails after the bucket exists
- The 7-vs-6 backend step count discrepancy (prompt 0 flags it, you resolve it)
