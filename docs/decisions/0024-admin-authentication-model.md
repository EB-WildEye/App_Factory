# 0024 — The admin authentication model

Status: DRAFT — not accepted. EB decides.
Date: 2026-08-31

Checklist row `N7` / `P6`. A gap: the spec is silent on who may create or delete
an app.

## Context

The Admin Dashboard is *"the only place an app is born or removed"*. The spec never
says who is allowed to use it. The build plan requires a **marked middleware seam**
and no implementation: *"Admin authentication is enforced at the route-handler
layer. Do not build auth now; leave one clearly marked middleware seam where it
will go."*

So the milestone's work is a seam, not a mechanism. The reason this still needs a
decision now is that **the model decides where the seam goes**, and a seam in the
wrong place is worse than no seam — it looks like protection.

What the shape of the system already forces:

- ADR 0005 puts every backend call through a route handler under `app/api`. So the
  handler layer is the only place a request can be refused before it reaches AWS.
  That part is settled.
- The route handlers hold the API Gateway credential. Anyone who can reach a
  handler can provision AWS resources, so an unauthenticated deployment is an open
  provisioning endpoint, not merely an information leak.
- The Data Center **edits clinical content** for a live medical assistant. The
  blast radius of an unauthorised write is a wrong answer to a patient, not a
  defaced page.
- Gali's own API has no authentication at all: `template.yaml` declares `/chat` and
  `/history/{session_id}` with CORS and no authorizer, and the frontend sends no
  credential. It is protected by obscurity and an allowlisted origin
  (`AllowedOrigins`). That is a finding about app #1's security posture, not a
  precedent to copy — a patient-facing chat endpoint and an admin provisioning
  endpoint are not comparable.

What is undecided: the identity provider, whether there are roles (can someone edit
data without being able to delete an app?), and whether an audit trail is required.
The last one is not a normal engineering nicety here — an app under
ethics-committee validation whose knowledge base can be edited without a record of
who edited it is a governance problem.

## Options considered

1. **A single shared secret or basic auth at the middleware.** Trivial to build;
   no identity, so no audit trail and no revocation for one person.
2. **An OIDC provider** (Cognito, Google Workspace, Entra) with a session cookie
   checked in middleware. Real identities, revocation, an audit subject. One more
   dependency and a redirect flow.
3. **Network-level only** — the admin app is not on the public internet, reachable
   over VPN or an IP allowlist. No application code at all; correct only if the
   hospital's network posture actually supports it.
4. **Two roles from the start**: an editor who can change content and re-embed, and
   an admin who can create and delete apps.

## Recommendation

**Option 2 for the mechanism, option 4 for the model, and for this milestone build
only the seam — but build it in the one place that survives either choice.**

Identity is the deciding factor, and it is not about login convenience. If the
factory can edit the knowledge base of a validated medical assistant, then "who
changed this file" has to have an answer, and only options 2 and 4 can produce one.
Option 1 cannot: a shared secret means every action is attributable to everyone,
and removing one person's access means rotating everyone's.

Two roles rather than one because the two actions are genuinely different in
consequence. Editing a KB file is reversible and re-embeddable; deleting an app
destroys a bucket, a KB, a table and a row. The same authority for both means the
person doing routine content work all day holds the ability to destroy an app all
day.

Option 3 is not an alternative to 2 — it composes with it, and if the hospital's
network can enforce it, it is the cheapest large win available. It is not a
substitute, because a VPN does not tell you who edited a file.

**For Milestone 1, concretely:** one `middleware.ts` at the repo root that matches
`/api/*` and, today, does nothing but pass through with a comment naming this ADR.
Placing it there is what matters — it is the only chokepoint that covers every
handler including ones not yet written, and moving it later means auditing every
route individually.

## Consequences

- One middleware file, one matcher, one marked seam. It is deliberately not a
  per-handler check: per-handler auth is how one new handler ships unprotected.
- The role split, if accepted, becomes part of the route contract in 0015 —
  `DELETE /api/apps/{appName}` requires admin, `PUT .../files/{id}` requires
  editor — so 0015 should record which role each route needs even before any of it
  is enforced.
- An audit trail needs a subject on every mutating call, which means the seam has
  to be able to produce one. A shared secret cannot, so choosing option 1 later
  would close the audit door.
- Gali's own endpoints are unauthenticated. That is out of scope for this ADR and
  belongs in whatever review covers the production system, but it should not be
  read as a decision that admin endpoints may be the same.
