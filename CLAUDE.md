# App Factory — working rules

## CONTEXT

This repo is "App Factory": a platform that provisions a complete chat
application (S3 bucket, Bedrock Knowledge Base + Data Source, DynamoDB history
table, subdomain) from a config form filled in by a creator. App #1 will be an
existing production chatbot called Gali.

The architecture is specified in `docs/app-factory-architecture.html`. It is the
source of truth for this project. Read it before answering any structural
question. When that file and your own instinct disagree, the file wins and you
raise the conflict with me.

> Filename note: earlier prompts refer to this spec as `docs/architecture.html`.
> The real path is `docs/app-factory-architecture.html`. There is no
> `docs/architecture.html`.

Gali is split across two separate repos, both available READ-ONLY:

| role     | path                                  |
| -------- | ------------------------------------- |
| backend  | `C:\Users\eb300\Desktop\Gali-AWS-backend` |
| frontend | `C:\Users\eb300\Desktop\Gali-frontend`    |

It is a working production system under an ethics-committee validation freeze.

## HARD RULES

1. Never write to, edit, or stage anything under the Gali paths. Read only.
2. Do not copy Gali source files wholesale into this repo. Read Gali to learn
   shapes and conventions, then write new code here.
3. This milestone is the GUI. No AWS SDK calls, no SAM template, no provisioning
   logic. The backend does not exist yet and we are not pretending it does. We
   are defining the contract it will have to satisfy.
4. When a decision is not determined by the prompt or by
   `docs/app-factory-architecture.html`, STOP and ask. Do not pick a default and
   continue. This applies especially to schema field names, route shapes, and
   anything the architecture marks TBD.
5. Hebrew RTL is the primary layout direction, not an afterthought.
6. Next.js App Router. Server Components by default; mark interactive surfaces
   `"use client"` deliberately, not reflexively.

## STACK (fixed for this milestone)

Next.js (App Router) + React + Bun + TypeScript + Tailwind, RTL Hebrew.
API shape is BFF: the browser talks only to Next route handlers under `app/api`,
which proxy to the SAM API Gateway. IaC is SAM, untouched in this milestone.
Consequences of BFF, which are binding:

- `services/factoryApi.ts` runs client-side and fetches RELATIVE paths only.
- No backend endpoint, key, or credential is ever exposed through a
  `NEXT_PUBLIC_` variable.
- Route handlers are thin proxies: validate with the zod schema, call API
  Gateway, normalize errors. No business logic in a handler.
- `output: 'export'` is impossible. The Next server is a deployment artifact.

## DECISION LOG — required reading

`docs/decisions/` is an ADR log, one file per decision,
`NNNN-short-title.md`, each with Context / Options considered / Decision /
Reasoning / Consequences.

**Read `docs/decisions/` before any structural change** — anything that touches
a schema field, a route shape, a resource name, a module boundary, or the
provisioning step sequence. A decision already recorded there is not reopened
without saying so explicitly.

How to use it:

- **Cheap to reverse** (a component name, a file split, a test helper): decide,
  log it, keep going. Do not stop for these.
- **Expensive to reverse** (schema fields, route shapes, resource naming,
  anything the spec marks TBD): STOP. Write the ADR with `Status: open` and the
  options laid out, then ask me. Never pick a default silently.
- An ADR with `Status: open` blocks the code that depends on it. Build
  everything that does not depend on it, and say what is blocked.

## SHELL AND PATHS

Binding. Both rules exist because both were broken once.

1. **Every git command uses `git -C <absolute-path>`. `cd` is never used, in any
   command, compound or otherwise.** A shell's working directory survives across a
   compound command and can survive into the next one, so a `cd` that looked
   scoped is how a command aimed at this repo lands in another. That is not
   hypothetical: on 2026-08-30 a `cd` into `Gali-frontend` earlier in the same
   command line caused a `git checkout -b` to create a branch inside a read-only
   repo. `Bash(cd *)` is in the deny list of `.claude/settings.json`, so this rule
   is enforced by the harness and not only by good intentions.
2. **Gali paths appear only in read commands.** Never `write`, `edit`, `stage` or
   `commit` under either Gali path — and "read" excludes anything that mutates
   `.git`, which is why `git status` and `git diff` are also out (they refresh the
   index). Use `git log`, `git show`, `git cat-file`, `git diff-tree`. Copying
   source *out* of Gali into this repo is expected and permitted.

## GIT

Binding. Stricter than the global working rules where the two overlap; nothing
here contradicts them.

1. **Commit after every meaningful change**, not batched at the end of a turn.
   Conventional Commits: `feat` `fix` `docs` `chore` `refactor` `test`. The
   subject says what changed and why. Never `update files`.
2. **One branch per feature or milestone unit**, named for the unit, branched off
   `main`: `chore/scaffold`, `feat/admin-dashboard`, `feat/data-center`,
   `docs/adr-<n>`.
3. **Merge when the unit is done and coherent** — never on a commit count. A
   branch that has run long without closing means the unit was scoped too big:
   say so and split it rather than merging a partial one. **Never commit directly
   to `main` after the baseline commit. Always ask before merging.**
4. **Every ADR decision gets its own commit**, referencing the ADR number in the
   subject.
5. **Never force-push. Never rewrite history that has been pushed. Never amend a
   commit I have already seen.**
6. **A commit's unit is a capability gained, not a file touched.** If a change
   needs three files to do anything at all, those three files are one commit. The
   test: after this commit, can the repo do something it could not do before? If
   the answer is "not until the next commit lands", the split is wrong. `54987d7`
   is the counter-example — it added the ESLint dependency and stopped, so the
   repo carried a linter it could not run until `07258cc` supplied the config and
   the script.

## CODE CONVENTIONS

Binding on every task in this repo.

- **One responsibility per module.** No business logic inside React components —
  hooks and services only. A component renders and wires; it does not decide.
- **Explicit types at every module boundary.** Every export is typed. No `any`,
  no implicit `any`, no `as` used to silence the checker.
- **No magic strings or numbers.** Named constants, and they live in one module.
  This includes Hebrew user-facing strings, route paths, storage keys, and
  status values.
- **Functions short enough to read without scrolling.** Prefer pure functions;
  push side effects to the edges.
- **Names say what a thing is, not how it is implemented.** No `utils`, no
  `helpers`, no `data2`, no type names that leak their container.
- **Delete dead code, never comment it out.** Git remembers. Commented-out code
  is a lie about what the module does.
