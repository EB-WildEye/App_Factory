# Provisioning orchestration: Step Functions vs a Lambda orchestrator vs a stack per app

**A comparison, not a decision. Nothing here is implemented.** The recommendation
at the end is queued as `QUESTIONS.md` Q33.

## What is already decided

Not reopened by this document:

- `createApp` returns **`202`**; the UI polls a status operation (0014).
- The **registry row is written first**, with a status, so a failed create still
  leaves a record (0013).
- Failure triggers **automatic rollback**.
- The data source is **S3**, so the `kb/` objects must exist before ingestion (0030).
- The vector store is **S3 Vectors** (`docs/gali-ground-truth.md` §9).
- API Gateway kills any request at **29 seconds**, so a synchronous `createApp`
  that waited for everything would time out *on success*.

What is undecided and is EB's: how the orchestration is implemented.

## Finding first: the seven-step list is missing a step

The seven steps as given are bucket, prompt artefact, knowledge base, data source,
chat table, registry row, subdomain. **Uploading the `kb/` markdown objects is not
in that list, and it is a resource-creating action with its own compensating
action.** The spec has it as B2 (`put_object` × N), and ADR 0030 makes it
load-bearing: with an S3 data source, ingestion reads what is in `kb/` at the moment
the job runs, so the upload must complete before the data source is ingested and
after the bucket exists.

It is called out here rather than worked around because it changes the rollback
list: a create that fails at the knowledge base leaves **objects** in the bucket,
not just the bucket. Whether that makes the sequence eight steps or whether the
upload folds into step 1 is exactly the ambiguity ADR 0006 is already open about.
**Queued as Q34.** The table below lists it as step 1b rather than silently
renumbering.

---

## 1. The seven steps, concretely

Needed regardless of which option wins. "Sync" means the API call returns the
finished state; "async" means the call returns and the work continues.

| # | step | what creates it | what deletes it | sync? | failure modes |
| - | ---- | --------------- | --------------- | ----- | ------------- |
| 0 | registry row, `pending` | `dynamodb:PutItem` | `DeleteItem` | sync | throttling; conditional-check failure if the app name already exists — which is the **only cheap duplicate-name guard the factory has** |
| 1 | S3 bucket | `s3:CreateBucket` + `PutBucketPolicy` | `DeleteBucket`, **only after emptying** | sync | `BucketAlreadyExists` (global namespace, someone else's); `BucketAlreadyOwnedByYou` (a retry, or an earlier failed create); `OperationAborted` (concurrent create on the same name); region/LocationConstraint mismatch |
| 1b | `kb/` markdown objects | `s3:PutObject` × N | `DeleteObjects` for every key written | sync | partial upload — some keys written, some not; a key that fails leaves a KB that will ingest an incomplete corpus |
| 2 | prompt artefact | `s3:PutObject` (one key under `prompt/`) | `DeleteObject`, **and its version** if the bucket is versioned | sync | as above; **and it is invisible to a registry-derived rollback list** — see §7 |
| 3 | knowledge base | `s3vectors:CreateIndex`, then `bedrock-agent:CreateKnowledgeBase` | `DeleteKnowledgeBase`, then `s3vectors:DeleteIndex` | **async** — returns `CREATING`, poll `GetKnowledgeBase` for `ACTIVE` | index-name collision; `ValidationException` on a bad `embeddingModelArn`; role not yet assumable (IAM is eventually consistent, and the role is created before the first KB); terminal `FAILED`; **`DELETE_UNSUCCESSFUL` is a real status**, so deletion can fail |
| 4 | data source + ingestion | `CreateDataSource`, then `StartIngestionJob` | `DeleteDataSource` (with `dataDeletionPolicy: DELETE` this removes its vectors); `StopIngestionJob` first if running | **async, and the long one** — `STARTING`/`IN_PROGRESS` → `COMPLETE`/`FAILED`/`STOPPED` | missing `overlapTokens` → `ValidationException` (it is **required**); role lacks `s3:GetObject` → ingestion fails after create succeeded; ingestion `FAILED` **after** steps 5 and 6 have already run; `DELETE_UNSUCCESSFUL` |
| 5 | chat table | `dynamodb:CreateTable` | `DeleteTable` | **async** — `CREATING` → `ACTIVE` | `ResourceInUseException` if the name exists; account table-limit quota; **holds patient conversations, so deleting it is destructive in a way no other step is** |
| 6 | registry row, finalised | `UpdateItem` — ids and `complete` | `DeleteItem` | sync | throttling; **an update that fails leaves a `provisioning` row over a complete app**, which is a lying row rather than a missing one |
| 7 | subdomain | Route 53 `ChangeResourceRecordSets` | delete the record | **async** — `PENDING` → `INSYNC` | record already exists; hosted zone not found; certificate not yet validated (0012 is still a draft, so this step's shape is not fixed) |

Three properties of this table decide the comparison:

- **Four of the eight actions are asynchronous** (3, 4, 5, 7) and one of them can
  outlive any single Lambda invocation. Polling is not an implementation detail
  here, it is most of the control flow.
- **`bedrock-agent` ships no waiters at all.** Verified against the botocore model
  in the Gali venv: `waiters-2.json` exists and its `waiters` map is **empty**. So
  there is no SDK-level "wait until ingested" to lean on in any option — every
  option writes the poll loop itself.
- **Two steps can fail *after* later steps have succeeded.** Ingestion (4) is
  started before the table (5) and the row finalisation (6) in any sensible
  ordering, and it can fail minutes later. So "roll back the steps completed so
  far" is not a stack unwind; it is a compensation over a set that is still moving.

---

## 2. The options

### A — AWS Step Functions (Standard workflow)

One state machine per *create*, not per app. States for each step, `Retry` blocks
for transient errors, `Catch` blocks routing to a rollback branch, `Wait`+`Choice`
loops for the four async steps.

### B — A Lambda orchestrator

One Lambda that runs the steps in order, writing its progress to the registry row
(or a side table) after each step so it can resume. Because Lambda has a hard
timeout ceiling well below what a large ingestion can take, it cannot simply loop
and wait — it must either re-invoke itself, or be re-invoked by a schedule, which
means the orchestrator is a state machine whose state lives in DynamoDB and whose
transitions are hand-written.

### C — A CloudFormation stack per app *(the third option)*

`createApp` calls `CreateStack` with a template describing the app's resources.
CloudFormation owns ordering (via `DependsOn` and implicit references), rollback
(`CREATE_FAILED` → `ROLLBACK_IN_PROGRESS` automatically) and teardown
(`DeleteStack`). ADR 0002 already commits the factory to SAM for the platform, so
this option is "use the IaC we already have for the per-app resources too" rather
than a new technology.

### D — EventBridge choreography *(found, and rejected here)*

Each step emits an event; the next step subscribes. No central coordinator. Rejected
for one reason that is decisive in this domain: **there is no single place that knows
the whole in-flight state**, so "what has been created so far" — the exact question a
rollback and a 2am page both need answered — has to be reconstructed from the
registry row and from AWS itself. It trades a coordinator for an inference problem,
and the inference is wrong precisely when things are broken. Not carried further.

---

## 3. What the SAM template looks like

### Option A — Step Functions

```yaml
  ProvisionAppStateMachine:
    Type: AWS::Serverless::StateMachine
    Properties:
      Name: !Sub appfactory-provision-${Stage}
      Type: STANDARD
      DefinitionUri: statemachine/provision-app.asl.json
      DefinitionSubstitutions:
        CreateBucketFunctionArn: !GetAtt CreateBucketFunction.Arn
        UploadKbObjectsFunctionArn: !GetAtt UploadKbObjectsFunction.Arn
        RegistryTableName: !Ref FactoryRegistryTable
      Policies:
        - LambdaInvokePolicy: { FunctionName: !Ref CreateBucketFunction }
        - LambdaInvokePolicy: { FunctionName: !Ref UploadKbObjectsFunction }
        - DynamoDBCrudPolicy: { TableName: !Ref FactoryRegistryTable }
        - Statement:
            - Effect: Allow
              Action: [ bedrock:CreateKnowledgeBase, bedrock:GetKnowledgeBase,
                        bedrock:CreateDataSource, bedrock:StartIngestionJob,
                        bedrock:GetIngestionJob, bedrock:DeleteDataSource,
                        bedrock:DeleteKnowledgeBase ]
              Resource: "*"
      Logging:
        Level: ALL
        IncludeExecutionData: true
        Destinations:
          - CloudWatchLogsLogGroup: { LogGroupArn: !GetAtt ProvisionLogGroup.Arn }
      Tracing: { Enabled: true }
```

The interesting part is not the SAM, it is the ASL — because the async steps and the
rollback edges are declarative:

```json
"StartIngestion": {
  "Type": "Task",
  "Resource": "arn:aws:states:::aws-sdk:bedrockagent:startIngestionJob",
  "Parameters": { "KnowledgeBaseId.$": "$.kbId", "DataSourceId.$": "$.dataSourceId" },
  "ResultPath": "$.ingestion",
  "Retry": [ { "ErrorEquals": ["Bedrock.ThrottlingException"],
               "IntervalSeconds": 5, "MaxAttempts": 5, "BackoffRate": 2 } ],
  "Catch":  [ { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error",
                "Next": "Rollback" } ],
  "Next": "WaitForIngestion"
},
"WaitForIngestion": { "Type": "Wait", "Seconds": 20, "Next": "GetIngestionJob" },
"GetIngestionJob": {
  "Type": "Task",
  "Resource": "arn:aws:states:::aws-sdk:bedrockagent:getIngestionJob",
  "ResultPath": "$.ingestion",
  "Next": "IngestionDone"
},
"IngestionDone": {
  "Type": "Choice",
  "Choices": [
    { "Variable": "$.ingestion.IngestionJob.Status", "StringEquals": "COMPLETE",
      "Next": "CreateChatTable" },
    { "Variable": "$.ingestion.IngestionJob.Status", "StringEquals": "FAILED",
      "Next": "Rollback" }
  ],
  "Default": "WaitForIngestion"
}
```

### Option B — Lambda orchestrator

```yaml
  ProvisionOrchestratorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub appfactory-provision-${Stage}
      Handler: app.lambda_handler
      Timeout: 900          # the ceiling, and still not enough for a long ingestion
      MemorySize: 512
      Environment:
        Variables:
          REGISTRY_TABLE: !Ref FactoryRegistryTable
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref FactoryRegistryTable }
        - Statement: [ { Effect: Allow, Action: [ s3:*, bedrock:*, dynamodb:*,
                         route53:ChangeResourceRecordSets, s3vectors:* ],
                       Resource: "*" } ]

  ProvisionResumeSchedule:               # because one invocation cannot wait it out
    Type: AWS::Scheduler::Schedule
    Properties:
      Name: !Sub appfactory-provision-resume-${Stage}
      ScheduleExpression: rate(1 minute)
      FlexibleTimeWindow: { Mode: "OFF" }
      Target:
        Arn: !GetAtt ProvisionOrchestratorFunction.Arn
        RoleArn: !GetAtt ProvisionSchedulerRole.Arn
```

Two things that template makes visible. The `Policies` block is broad — a single
function that performs every step needs every permission, so **the blast radius of a
bug in it is the union of all seven steps**. And the second resource exists only
because the first one cannot wait: an every-minute schedule that wakes up, reads
in-flight rows, and continues them. That schedule is the hand-written half of a state
machine.

### Option C — CloudFormation stack per app

```yaml
  # Platform template: the function that creates the per-app stack.
  CreateAppStackFunction:
    Type: AWS::Serverless::Function
    Properties:
      Policies:
        - Statement:
            - Effect: Allow
              Action: [ cloudformation:CreateStack, cloudformation:DescribeStacks,
                        cloudformation:DeleteStack ]
              Resource: !Sub arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/appfactory-*
            - Effect: Allow          # what CFN needs, passed to it
              Action: iam:PassRole
              Resource: !GetAtt AppStackDeploymentRole.Arn
```

```yaml
  # Per-app template, instantiated once per app.
  Parameters:
    AppName: { Type: String }
  Resources:
    AppBucket:
      Type: AWS::S3::Bucket
      DeletionPolicy: Delete            # see the trap below
      Properties:
        BucketName: !Sub appfactory-${AppName}-${AWS::AccountId}
    ChatTable:
      Type: AWS::DynamoDB::Table
      DeletionPolicy: Retain            # patient conversations
      Properties: { ... }
    KbIngestion:
      Type: Custom::BedrockIngestion    # no CFN resource models an ingestion job
      Properties:
        ServiceToken: !GetAtt IngestionCustomResourceFunction.Arn
        KnowledgeBaseId: !Ref AppKnowledgeBase
```

**The trap is in the two `DeletionPolicy` lines, and it is the sharpest thing in this
document.** CloudFormation's automatic rollback deletes what it created. For the
bucket that is what you want on a failed create — and it is exactly what you must
*not* have on the chat table once the app is live. But `DeletionPolicy` is a property
of the template, not of the situation: the same `Retain` that protects patient
conversations from an accidental `DeleteStack` also **strands the table on a failed
create**, and the same `Delete` that cleans up a failed create will destroy
conversations if a later update replaces the resource. One knob, two opposite
requirements, and CloudFormation gives no way to vary it per event.

---

## 4. Cost per create, and the curve

The honest answer is that **orchestration cost should not decide this**, and the
arithmetic is worth showing so nobody re-opens it on cost grounds.

| option | what you pay for | per create | shape as app count grows |
| ------ | ---------------- | ---------- | ------------------------ |
| A Step Functions Standard | **state transitions**, plus the Lambdas it invokes | the poll loop dominates: a 10-minute ingestion polled every 20s is ~30 iterations × 3 transitions = ~90 transitions, plus ~20 for the rest | linear in **creates**, not in apps. Flat once creating stops |
| B Lambda orchestrator | GB-seconds, plus the resume schedule running forever | one create ≈ a few Lambda-seconds spread over several invocations | linear in creates, **plus a constant** — the every-minute schedule bills whether or not anything is being created |
| C Stack per app | CloudFormation itself is not billed for the resource types here; the custom-resource Lambdas are | roughly B's Lambda cost, minus the schedule | linear in creates. Flat at rest |

Three things about that table matter more than the numbers:

1. **All three are cents per create.** The recurring cost of an app — S3 Vectors
   storage, the DynamoDB tables, the KB — is identical in all three options and is
   orders of magnitude larger than the orchestration. Choosing on orchestration cost
   is optimising the wrong term.
2. **Only option B has a floor.** The resume schedule is a cost that exists when the
   factory is idle. It is small, and it is the only line that is not proportional to
   work done.
3. **The one place cost could bite is A, and it is avoidable.** Standard workflows
   bill per transition, so a tight poll interval multiplies cost by concurrent
   creates. A 5-second interval on an hour-long ingestion is ~2,160 transitions for
   one create. The fix is a longer interval, or exponential backoff in the Wait, and
   it should be a deliberate parameter rather than a number someone types once.

**Unit prices are deliberately not quoted here.** They could not be verified from
this machine (the pricing API was not called), and a stale price in a decision
document is worse than no price. The shapes above are what the decision needs; if a
number is wanted, read the Step Functions and Lambda pricing pages for `eu-west-1`
and multiply by the transition counts given.

---

## 5. What debugging a 2am failure actually looks like

The scenario: an app is stuck. The registry row says `provisioning`. Nobody knows
which step, or whether a rollback ran.

**Option A.** Open the execution in the Step Functions console. The graph shows every
state, which one is red, the input and output of each, and the error and cause
strings — provided `Logging.IncludeExecutionData: true`, which is why it is in the
template above. `GetExecutionHistory` gives the same thing as an API call.
`DescribeExecution` returns `status`, `error`, `cause`, and — verified in the
service model — `redriveCount`, `redriveStatus` and `redriveStatusReason`. There is
also `TestState`, which runs **one state in isolation** with your input, so a fix can
be checked without re-running the create.

**Option B.** Open CloudWatch Logs and read. What you can see is exactly what the
author decided to log, and the thing you most want — the input to the step that
failed — is only there if someone logged it. The orchestrator's own progress record
in DynamoDB is the state, so answering "where is it" means querying the table and
trusting that the write after the last successful step actually happened. The failure
mode that hurts: the process died *between* doing a thing and recording that it did.

**Option C.** Open the stack's Events tab. CloudFormation lists every resource
transition with a `ResourceStatusReason`, which is usually the underlying API error.
That is good. Two things are not: a failed rollback puts the stack in a state that
must be cleared by a human before anything else can happen to that stack, and a
failure inside a **custom resource** appears as a timeout or a generic failure unless
the custom-resource Lambda was careful to signal a useful reason — and the ingestion
job is a custom resource in this design, so the longest and most failure-prone step
is the one with the worst diagnostics.

**Ranking for this requirement: A, then C, then B.** A is the only one where the
in-flight state *is* the artefact you inspect, rather than something reconstructed
from logs or from a table you hope was written.

---

## 6. Rollback — the requirement that motivated this

Two questions, and the second is the one that decides it.

### 6.1 Can it express the ordering these steps need?

The ordering is not a simple reverse of creation:

- The bucket cannot be deleted until it is **emptied**, and the things to empty
  include `kb/` objects (1b), the prompt artefact (2), and object *versions* if
  versioning is on.
- The data source must be deleted **before** the knowledge base, and an
  in-flight ingestion must be **stopped** before the data source goes.
- The registry row must be deleted or marked **last**, because it is the only thing
  that makes the app visible; removing it first turns a failed rollback into an
  invisible orphan.
- The chat table is destructive, so it should be the step a human can most easily
  interrupt.

| option | expresses the ordering? |
| ------ | ----------------------- |
| A | **Yes, directly.** The rollback branch is an explicit sequence of states; each has its own `Retry` and its own `Catch`. The order is visible in the definition and reviewable in a diff. |
| B | **Yes, but only as code.** A hand-written reverse sequence. It works; the ordering constraints live in someone's head and in the order of statements, and nothing structural stops the next editor from reordering two of them. |
| C | **Yes for what CloudFormation manages, and not at all for what it does not.** CFN unwinds in dependency order automatically, which is the right order for free. But the emptying of the bucket, the stopping of an ingestion job, and anything behind a custom resource are outside that — they need custom-resource `Delete` handlers, and a `Delete` handler that fails blocks the stack. |

### 6.2 What happens when the rollback itself fails?

This is where the three options separate.

**Option A.** A failure inside the rollback branch is just another state failure, so
it can be caught and routed — to a state that writes `failed, rollback incomplete`
with the list of what is stranded (draft ADR 0031). And Step Functions has a
mechanism for this case specifically, which is verified rather than assumed: an
execution can end in **`PENDING_REDRIVE`**, and **`RedriveExecution`** restarts it
**from the failed state, keeping the original execution history**. So the 2am
operator's move is "fix the permission, redrive" — not "work out what already
happened and hand-run the rest". `redriveCount` records how many times that
happened. Nothing else here offers that.

**Option B.** A failure inside the rollback is an exception inside the handler that
was cleaning up after an exception. Whatever it does next is code someone wrote for a
path that is, by definition, rarely exercised — and the most likely outcome is that
the function dies leaving neither a clean ground nor an accurate record. Making this
robust is possible and is precisely the work Step Functions has already done: durable
state, per-step retries, and a resume primitive.

**Option C.** CloudFormation's answer is a stack in a **rollback-failed** state. It
is loud, which is good, and it is *stuck*, which is not: the stack cannot be
progressed until a human intervenes, and the intervention is skipping the resources
that would not delete — which strands them, exactly the state ADR 0031 calls
`failed, rollback incomplete`. So C reaches the right terminal state, but reaching it
requires a console session, and the list of stranded resources is in the stack's
events rather than on the registry row where the UI can show it.

**On this requirement: A clearly, C second, B last.**

---

## 7. The B3 orphan

Step 2 writes a prompt artefact to `prompt/…`. It appears in **no registry field** —
the row holds the app name, the KB id, the table name, the UI id. So a rollback
routine that builds its list from the registry row's *named resources* will delete
the bucket, the KB, the table and the row, and never mention the artefact. It happens
to be swept up when the bucket is emptied — but only if the emptying is "empty the
bucket", not "delete the keys we recorded".

| option | how the artefact is covered |
| ------ | -------------------------- |
| A | The rollback branch has a state for it, because the create branch had a state for it. **Symmetry is enforced by review, not by the tool** — nothing in Step Functions notices a missing undo state. What it does give: the execution input and output are durable, so the artefact's key is *in the execution*, and the rollback can read it from there instead of re-deriving it. |
| B | Covered only if the author remembered. The artefact's key is in a variable, and the orchestrator's progress record has to include it or the resume path loses it. This is the option where the orphan is most likely to survive. |
| C | **Covered structurally, and this is C's best moment.** If the artefact is written by a resource in the stack, CloudFormation deletes it on rollback because it created it — no list, no derivation, no memory required. Its `S3::Bucket` deletion still needs the bucket emptied first, so a custom resource is still needed for that, but the artefact is not a special case. |

The general lesson, independent of the option chosen: **a rollback list derived from
the registry row is wrong by construction**, because the row records *identifiers*
and rollback needs *everything created*. The rollback must be derived from what the
create did, not from what the row remembers — which is an argument for the create's
own record being the durable thing. A and C both have that; B has to build it.

---

## 8. Recommendation

**Option A, Step Functions Standard, with the per-app resources still described in
one place rather than scattered across seven Lambdas.**

The reasoning, in the order the weight falls:

1. **The rollback-of-rollback requirement is decisive, and only A has a primitive
   for it.** `RedriveExecution` restarting a failed execution from the failed state,
   with `redriveCount` and `PENDING_REDRIVE` visible in `DescribeExecution`, is
   exactly the operation the 2am scenario needs. In B it is code nobody has
   exercised; in C it is a stuck stack and a console session.
2. **Most of this workflow is waiting**, and the tool whose primitives are
   `Wait`, `Choice`, `Retry` and `Catch` is the one that expresses waiting without
   inventing a scheduler. B's every-minute resume schedule is a state machine with
   the state in DynamoDB and the transitions in someone's head.
3. **In-flight state is the artefact you debug.** The comparison in §5 is not close.
4. **C is genuinely attractive and loses on two specifics**, both of which are worth
   stating because if either changes, C should be re-examined: the `DeletionPolicy`
   trap in §3, where one knob has to serve two opposite requirements; and the fact
   that the longest, most failure-prone step — ingestion — has to be a custom
   resource, which is the worst-diagnosed thing in a CloudFormation stack. There is
   also an unverified dependency: whether CloudFormation has resource types for the
   Bedrock knowledge base, the data source and the S3 Vectors index at all
   (§9). If it does not, C needs custom resources for the whole KB step and its
   advantage disappears.

What the recommendation costs, stated plainly:

- **A new runtime concept in the stack.** ASL is a second language in the repo, and
  a JSON state machine is harder to review than Python for someone who has not read
  ASL before. Mitigation: the definition is a file in the repo and diffs like code.
- **Local testing is worse than B's.** A Lambda orchestrator can be run end to end
  on a laptop; a state machine cannot, short of Step Functions Local. `TestState`
  helps per state but does not replace a local run.
- **Standard-workflow cost is per transition**, so the poll interval becomes a cost
  parameter (§4). It has to be chosen, not defaulted.
- **It does not solve step symmetry.** Nothing in Step Functions notices that the
  create branch has eight steps and the rollback branch has seven. That stays a
  review discipline, and §7 is where it bites.

## 9. What could not be verified from this machine

Both belong in a documentation read, not a guess:

1. **CloudFormation resource coverage** for `AWS::Bedrock::KnowledgeBase`,
   `AWS::Bedrock::DataSource`, and S3 Vectors buckets and indexes.
   `cloudformation:DescribeType` was attempted for each and returned **AccessDenied**
   for this IAM user, and no local CloudFormation resource specification, `sam` or
   `cfn-lint` is installed. Option C's viability depends on the answer.
2. **Current unit prices** for Step Functions state transitions and Lambda
   GB-seconds in `eu-west-1`. Not called, so not quoted.

Verified, and worth recording because each was checked rather than recalled:

- `bedrock-agent` ships **no waiters** — the `waiters` map in its botocore model is
  empty, so every option writes its own poll loop.
- Step Functions exposes `RedriveExecution` (input `executionArn`, optional
  `clientToken`), and `DescribeExecution` returns `redriveCount`, `redriveDate`,
  `redriveStatus` and `redriveStatusReason`. `ExecutionStatus` includes
  **`PENDING_REDRIVE`** alongside `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`,
  `ABORTED`.
- `TestState` exists as an API operation.
- `StartIngestionJob` takes no file, key or prefix parameter, which is why step 4 is
  per data source (ADR 0030).
