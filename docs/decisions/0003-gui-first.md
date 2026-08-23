# 0003 — GUI built first, and its output is the backend spec

Status: accepted
Date: 2026-08-23

## Context

The provisioning backend does not exist. The architecture spec describes the
backend steps and the resources they create, but names exactly one route:
`POST /apps` returning `202`. Milestone 1 has to start somewhere.

## Options considered

1. **Backend first** — build the provisioning service, then a UI over it.
2. **GUI first** — build the Admin Dashboard and Data Center, and let the config
   JSON the create form produces *become* the backend input contract.
3. **Both at once**, against a hand-written contract agreed up front.

## Decision

GUI first. Milestone 1 is the Admin Dashboard plus the Data Center. The JSON the
create form produces is the specification for what the provisioning service must
consume. The backend is mocked locally so the GUI runs today.

## Reasoning

The contract is the risky artefact, not the AWS calls. `AppConfig` — which
fields exist, what the five system-prompt parts are, what a data file is — is
the thing every other part of the system is shaped by, and it is far cheaper to
discover the right shape by building the form a human actually fills in than by
guessing at a schema first. Backend first would freeze a schema derived from
Gali's current hard-coded values, which is precisely the thing being
generalised.

## Consequences

- No AWS SDK calls, no provisioning logic, no SAM template this milestone.
- A local mock (`services/factoryApi.mock.ts`) is a first-class deliverable, not
  scaffolding. Real and mock stay interchangeable behind
  `NEXT_PUBLIC_USE_MOCK_API`.
- The mock must model partial failure, so the GUI can render a half-created app
  from day one rather than bolting that case on later.
- `types/appConfig.ts` and its zod schema are the deliverables of record.
  Changing them later is expensive and needs an ADR.
- The Dev Dashboard (monitoring, deploy) is in the spec but out of Milestone 1.
