# 0002 — SAM as IaC

Status: accepted
Date: 2026-08-23

## Context

The per-app AWS resources (S3 bucket, Bedrock KB + Data Source, DynamoDB chat
table, factory registry row, subdomain) and the provisioning service that
creates them need an infrastructure-as-code tool. Gali's backend already uses
SAM.

## Options considered

1. **SAM** — matches the existing Gali backend.
2. **CDK** — typed infrastructure in TypeScript, same language as the GUI.
3. **Terraform** — provider-neutral, strong state handling.
4. **No IaC** — provision entirely with SDK calls from the provisioning service.

## Decision

SAM. Not touched in this milestone.

## Reasoning

Gali's backend is already SAM, and Gali is App #1 — a different IaC tool would
mean rewriting the one working backend before the factory around it exists. CDK
in TypeScript is attractive for consistency with the GUI, but the win is
cosmetic against the cost of migrating a frozen production stack.

Note the split this creates. The *platform* — API Gateway, the provisioning
service, the factory registry table — is a fixed SAM stack. The *per-app*
resources are created dynamically at runtime by SDK calls, because their names
and their number are not known at deploy time. IaC therefore does not cover the
per-app resources, which is exactly why each creation step needs its own
compensating action (see 0013).

## Consequences

- No SAM template work in Milestone 1. Hard Rule 3.
- The GUI's job this milestone is to define the contract the SAM-deployed API
  Gateway must satisfy, not to deploy anything.
- Per-app resources sit outside IaC state, so nothing rolls them back for free.
- Revisit only if Gali's backend is rewritten for some other reason.
