# 0028 — The daily conversation digest, and deletion after a confirmed send

Status: DRAFT — the **policy** is approved by EB (2026-08-31); the mechanism below
is drafted and not accepted.
Date: 2026-08-31

## The approved policy

> Each app's conversations are emailed daily to a secure hospital address via SES,
> and deleted **only after a confirmed send**. DynamoDB TTL is a backstop, not the
> mechanism.

Sequence: **send → confirm success → record the send for that date → delete.** On
SES failure nothing is deleted and the job retries. One shared scheduled job reads
the registry; provisioning creates no per-app Lambda. The recipient address is an
`AppConfig` field. A half-provisioned app with no chat table is skipped, not an
error.

## Context

Gali already emails nightly, and the way it does it is the reason this policy
exists.

| what Gali does | provenance |
| -------------- | ---------- |
| A `BackupFunction` scans the chat table, formats the conversations and sends them with SES `SendRawEmail` | `functions/backup/app.py`, `template.yaml:271-297` |
| Scheduled `cron(0 23 * * ? *)`, `Asia/Jerusalem`, described as *"Nightly backup at 23:00 Asia/Jerusalem (before 24h TTL)"* | `template.yaml:329-346` |
| Retries: `MaximumRetryAttempts: 2`, `MaximumEventAgeInSeconds: 3600` | `template.yaml:344-346` |
| Splits the message to stay under a 10 MB raw-message limit | `functions/backup/app.py:47,157,276` |
| A CloudWatch alarm fires if the function errors, described as *"chat history may not be emailed before TTL wipe"* | `template.yaml:376-396` |
| Deletion is by **TTL only**: every item expires at the next midnight Israel time | `shared/shared/history.py:87-91` |

**The defect the policy fixes is in the last two rows together.** The backup runs
at 23:00 and the TTL fires at 00:00, so there is **one hour of margin**, and the
TTL fires *whether or not the send succeeded*. If the 23:00 run fails, the two
retries have an hour, and then the conversations are deleted anyway. The alarm
tells a human that a day of clinical conversations was lost; it does not stop the
loss. Gali's template says so in its own alarm description.

So today deletion is time-driven and the send is best-effort. The policy inverts
that: the send is the mechanism, and deletion is a consequence of it.

The factory changes the shape of the problem too. Gali is one app with one nightly
job baked into its stack. The factory has N apps, and the spec's provisioning
sequence (B1–B7) creates no Lambda and no schedule — so a per-app job would be a
new provisioning step, a new rollback action, and N schedules to operate.

## Options considered

**On what runs the job:**

1. **One shared scheduled job that reads the registry** and loops over apps.
   Provisioning creates nothing. One schedule, one function, one alarm.
2. **A per-app Lambda plus a per-app schedule**, created at provisioning time. Full
   isolation, and an eighth and ninth provisioning step with two more compensating
   actions.
3. **One schedule that fans out** — a dispatcher that invokes one execution per app.
   Isolation without N schedules; one more moving part.

**On recording the send:**

A. An attribute on the registry row, `lastDigestSentDate`. One value, no new table.
B. A **separate `digest-sends` table**, keyed `app_name` HASH + `digest_date`
   RANGE, one item per app per day.
C. An S3 object per app per date, alongside the sent artefact.

## Recommendation

**Option 1 for the job, option B for the send record, and the TTL must be
lengthened.**

### The job

Option 1 is what the policy already specifies, and it is right for a reason worth
recording: **the registry is the list of apps, so a job that reads the registry is
correct by construction as apps are created and deleted.** A per-app schedule has
to be created and destroyed in step with the app, which means two more things that
can be left behind by a failed create (draft ADR 0013's orphan problem, in a new
place). Option 3 is the upgrade path if one app's volume starts crowding out the
others — not needed at N=1.

Three properties the loop must have, none optional:

- **Per-app isolation of failure.** One app's SES failure must not abort the apps
  after it in the loop. Collect outcomes, then report.
- **Idempotency.** A retry must not send twice or delete what it did not send. That
  is what the send record is for.
- **Skip, don't fail.** A registry row whose provisioning state is not `complete`,
  or whose table read raises `ResourceNotFoundException`, is **skipped** — logged at
  INFO, counted as a metric, not an error and not an alarm. A half-provisioned app
  having no conversations to email is the expected case during a create, not a
  fault.

### The send record

Option B, because the record has to answer *"which dates are still unsent"* and not
just *"was anything sent recently"*. Option A cannot: a single `lastDigestSentDate`
loses the fact that the 29th and the 30th are both outstanding. That only matters
once data survives longer than a day — which the next section makes true.

Suggested item: `app_name`, `digest_date` (`YYYY-MM-DD` in `Asia/Jerusalem`),
`sent_at`, `ses_message_id`, `turn_count`. Give it its own TTL, generously long, so
the ledger housekeeps itself without becoming the thing that loses data.

### The TTL has to change, and this is the consequence people will miss

**If deletion follows a confirmed send, a TTL of "next midnight Israel time" still
destroys unsent data.** It is a backstop that fires before the mechanism has run out
of chances. Extending the TTL is not a tuning preference, it is a requirement of the
policy: the backstop must be *later* than the point at which the digest has
definitively failed and a human has intervened.

That trades one risk for another and both should be said out loud. A longer TTL
means patient conversations sit in DynamoDB longer, which is a data-retention change
in a system under ethics-committee validation — and Gali's own disclaimer text
**promises the patient** *"the conversation is deleted after 24 hours and is not kept
in the medical file"* (`docs/gali-ground-truth.md` §1.2). Lengthening the TTL without
changing that sentence would make the product lie to the patient. The number is
therefore EB's and the committee's, not an engineering choice — queued as Q31.

### What "confirmed" actually means

`SendRawEmail` returning a `MessageId` means **SES accepted the message**, not that
it reached a mailbox. Bounces and complaints arrive later, asynchronously, over SNS.
So "confirmed send" as implemented is *accepted for delivery*, and deleting on that
basis is deleting on an assumption.

Recommend: treat the `MessageId` as the confirmation that unblocks deletion,
**and** subscribe to bounce and complaint notifications, **and** state the
distinction in whatever document tells the hospital what the guarantee is. A bounce
that arrives after deletion is unrecoverable, which is an argument for the delete
step lagging the send by a day rather than following it within the same run.

## Consequences

- **`AppConfig` gains `digestRecipientEmail`**, validated as an email address
  (`lib/appConfigSchema.ts`). Its wire name is **queued as Q29** — no spec artefact
  names it, because the spec has no digest — so `app/api/appConfigWire.ts` does not
  carry it yet and the mapper's key count is unchanged.
- **The sender is platform-level, not per app.** One SES identity for the factory,
  verified once. Gali carries both `SenderEmail` and `RecipientEmail` as stack
  parameters; only the recipient varies per app, and only the recipient is a
  creator-facing choice.
- **A new platform table**, `digest-sends`, alongside 0020's vector store and 0021's
  KB role in the set of things that must exist before app #1. The factory's platform
  surface is now three items the spec never mentions.
- **The chat-history TTL becomes a policy input rather than a constant**, and the
  patient-facing disclaimer text is coupled to it. See Q31.
- **Deletion becomes application logic**, so it needs the same care as create: a
  delete that partially fails leaves some turns gone and some not, and the send
  record is what makes that recoverable.
- **Whether app #1 moves onto this** is 0018's question. Gali has a working nightly
  backup with the flaw described above; replacing it is a change to a validated
  system.
- The 10 MB raw-message limit is real and Gali already splits around it
  (`functions/backup/app.py:47`). A multi-part send raises a question this ADR does
  not answer: if part 2 of 3 fails, nothing may be deleted, so the send record has to
  record *whole-digest* success and not per-message success.

## What this ADR does not decide

- The TTL value, and the disclaimer sentence that depends on it (Q31).
- Whether `digestRecipientEmail` must be inside a permitted hospital domain (Q30).
- The digest's format. Gali formats blocks of conversation into a text email; the
  factory may want a machine-readable attachment for the ethics committee. Nobody
  has asked for either.
- The schedule time. 23:00 `Asia/Jerusalem` is Gali's, chosen to beat a TTL that
  this ADR proposes to move, so it should be re-chosen rather than inherited.
