# 0005 — BFF over browser-to-API-Gateway

Status: accepted
Date: 2026-08-23

## Context

The GUI must call the provisioning backend, which will sit behind a SAM-deployed
API Gateway. Two shapes were on the table.

## Options considered

1. **Option A, direct** — the browser calls API Gateway. Needs the endpoint, and
   some credential or key, present in client-side code.
2. **Option B, BFF** — the browser calls Next route handlers under `app/api`,
   which proxy to API Gateway server-side.

## Decision

Option B, BFF. Closed. Not reopened.

## Reasoning

Option A requires an AWS endpoint and a credential to exist in the browser
bundle. For a tool whose entire job is creating and deleting AWS resources, that
is not a trade worth making. The BFF also gives one place to enforce admin
authentication and one place to normalise backend errors, instead of every
caller handling both.

The cost is that the Next server stops being optional.

## Consequences

- `services/factoryApi.ts` runs client-side and fetches RELATIVE paths only.
- One route handler per operation under `app/api`, each a thin proxy: validate
  input with the zod schema, call API Gateway, normalise errors. No business
  logic in a handler.
- Nothing backend-related is exposed through a `NEXT_PUBLIC_` variable. The only
  permitted one is `NEXT_PUBLIC_USE_MOCK_API`.
- Admin authentication is enforced at the route-handler layer. Not built now;
  one clearly marked middleware seam is left where it goes.
- A static export is impossible. The Next server is a real deployment artefact.
  This is noted in the README.
