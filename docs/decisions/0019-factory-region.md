# 0019 — The factory's AWS region

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N1` / `P3`. A gap: needed by the system, never stated as a
decision.

## Context

The architecture spec mentions a region exactly once, inside an illustrative
`create_bucket` sample: `eu-west-1`. It is never stated as a decision, never
repeated, and nothing says whether every app lives in one region or whether a
creator picks one.

Production Gali is consistently `eu-west-1`, in four independent places
(`docs/gali-ground-truth.md` §5):

- `shared/shared/config.py:14` — `BEDROCK_REGION` default
- `scripts/ingest_kb.py:34` — `REGION`
- `functions/backup/app.py:33` — SES client
- `Gali-frontend/src/services/apiService.ts:1` — the fallback API URL contains
  `execute-api.eu-west-1.amazonaws.com`

So the value is not in doubt. What is undecided is whether it is *the factory's*
region or *Gali's* region, and that distinction has consequences the spec never
touches.

Region is not a cosmetic setting here. Three things depend on it:

1. **S3 bucket names are globally unique but buckets are regional.** A name taken
   in one region is taken everywhere, so `appName` collides across regions
   (see 0025).
2. **Bedrock model availability differs by region**, and Gali's inference profile
   ids are region-prefixed: `eu.anthropic.claude-sonnet-4-5-...`. Moving region
   means different model ids, which means re-validating a frozen system.
3. **A Bedrock Knowledge Base and its vector store are regional**, and a KB cannot
   read an S3 bucket in another region without cross-region configuration that
   Bedrock does not universally support.

## Options considered

1. **One region for the whole factory, fixed at `eu-west-1`.** Not a per-app
   setting. The factory has one region, stated once, and every app is created in
   it.
2. **Region is a field on `AppConfig`**, chosen per app, defaulting to
   `eu-west-1`. Maximum flexibility; every downstream resource name, model id and
   IAM policy becomes region-dependent.
3. **Region comes from the deployment environment** — whatever region the SAM
   stack is deployed to — and is not in the config at all.

## Recommendation

**Option 1, `eu-west-1`, stated once as a factory constant.**

The reason to reject option 2 is not simplicity, it is the model ids. Gali's
primary and fallback models are region-prefixed inference profiles. A per-app
region turns "which model does this app use" into a function of the region, so a
creator choosing a region is implicitly choosing a model — and if the profile does
not exist in the chosen region, the app provisions successfully and fails on the
first chat request. That is the worst failure shape available: late, remote from
the mistake, and invisible until a patient hits it.

Option 3 is close to correct and is what Gali actually does
(`os.environ.get("AWS_REGION", "eu-west-1")`), but it hides the value from the
factory's own config, and the factory needs it at *validation* time, not only at
runtime: bucket-name validation, model-availability checks and KB-region checks all
happen before any resource is created.

So: a single named constant, one module, no `AppConfig` field. If a second region
is ever needed, that is a new decision with the model-availability question
attached, and it should cost an ADR.

## Consequences

- One named constant, and no region field in `AppConfig` — which keeps the create
  form from offering a choice that would silently change the model.
- `appName` uniqueness is global-per-factory rather than per-region, which
  simplifies 0025: one region means one namespace to check.
- Any future second region reopens this ADR, 0025 and the model configuration
  together.
- Gali needs no change: it is already `eu-west-1` everywhere.
