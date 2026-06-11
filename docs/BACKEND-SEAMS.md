# Practical Backend Seams

This document is the operating spec for roadmap section 6: `Practical Backend Capabilities`.

It is intentionally product-facing.

The question here is not "what backend architecture exists in the abstract?"

The question is:

- what reusable backend seams make real apps cheap to build
- what should be first-class capability surfaces rather than ad hoc handler code
- what order gets the most product richness fastest
- what must be true before roadmap boxes in section 6 can honestly turn `[X]`

Related direction:

- [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md)
- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)
- [BASELINE.md](C:\Users\aaron\Documents\world\BASELINE.md)

---

## Current Baseline

The current backend slice is real but narrow:

- generic HTTP host startup through `serverRunner`
- explicit route mounting through `route` + `serve`
- session read/open/logout on the generic host
- built-in backend capability envelopes:
  - `http.serve`
  - `fs.json.read`
  - `fs.json.write`
- app-specific backend behavior still expressed through explicit handler sets

That is an honest baseline.

It is not yet a practical backend capability surface for ordinary product work.

The next seam should therefore not be "more hidden handlers."

It should be explicit capability seams that make common product needs composable.

---

## Locked Decisions

- Roadmap boxes in section 6 turn `[X]` only when runtime behavior, tests, and honest capability boundaries exist.
- The active starting slice is `Files + Uploads`.
- The roadmap should show sequence, phases, and completion rules.
- This document is the detailed operating spec for section 6.
- Existing capability mechanics in `src/modules.js`, `src/runtime-builtins.js`, and `src/host.js` remain the baseline contract that section 6 extends.

---

## Guiding Rules

### 1. One seam, many providers

Do not create separate product concepts for SQLite, Postgres, MySQL, S3, local disk, Resend, Twilio, or Google OAuth.

Create one product seam per capability area, then let providers implement that seam.

Examples:

- one relational data seam with SQLite, Postgres, and MySQL adapters
- one object/file seam with local disk and hosted object-store adapters
- one outbound email seam with stub and provider adapters

### 2. Keep external systems as proxies, not hidden truth

If the app writes to Postgres, uploads a file, sends an email, or federates through OAuth, the world should still be able to witness:

- intent
- attempt
- success or failure
- external reference ids

The external system may be authoritative for its own storage mechanics, but the product should still project the relationship truthfully.

### 3. Start local and stub-first

For file storage, uploads, email, SMS, OAuth, outbound HTTP, and webhooks, the first slice should prefer a local or stub provider.

That gives:

- product flows that can be built now
- deterministic tests
- no forced vendor commitment during seam design

### 4. Make async and retry semantics first-class

Real-world backend work is not only request-response.

Uploads, webhooks, email, SMS, search indexing, and external API calls all want:

- outbox semantics
- retries
- idempotency
- job scheduling

If the seam assumes everything completes inline in a request, it will be wrong quickly.

### 5. Keep authority and config explicit

Every backend seam should expose:

- required authority
- configuration surface
- where secrets and config come from
- placement rules

That fits the current capability model and avoids hidden environment magic becoming the real system.

---

## Section 6 Program Map

The exact phase order for roadmap section 6 is:

### Phase 0. Foundation contracts

This phase defines the seam-wide rules that later capabilities must obey.

Outputs:

- `runtime.config` capability contract
- provider-adapter contract for practical backend capabilities
- side-effect witness contract
- backend authority expectations

### Phase 1. Files and uploads

This is the active first slice.

Outputs:

- `fs.blob`
- `fs.stream`
- `upload.asset`
- local-disk provider path
- public/private hosting behavior
- deterministic file/upload test flows

Why this slice starts first:

- it makes the product feel materially more real quickly
- it exercises storage, authority, hosting, and async seams together
- it does not require a cloud provider before the seam is useful

### Phase 2. Data and async substrate

Outputs:

- `db.sql`
- `jobs.queue`
- `search.index`

This phase creates the durable and asynchronous substrate that later integrations depend on.

### Phase 3. Identity and external integrations

Outputs:

- `auth.oauth`
- `http.outbound`
- `webhook.inbound`
- `notify.email`
- `notify.sms`

This phase layers practical federation and integration capability over the earlier storage, config, and job seams.

### Phase 4. Product honesty and operability

Outputs:

- diagnostics for backend capability config and provider status
- diagnostics for failed side effects
- bootstrap or inspection surfaces for practical backend capabilities
- explicit enforcement that external systems remain proxy-shaped rather than hidden truth stores

---

## Locked Public Capability Interfaces

These capability ids and default placements are standardized for section 6:

- `runtime.config`
  - placement: `serverRunner`
- `fs.blob`
  - placement: `context`, `serverRunner`
- `fs.stream`
  - placement: `context`, `serverRunner`
- `upload.asset`
  - placement: `serverRunner`
- `db.sql`
  - placement: `context`, `serverRunner`
- `jobs.queue`
  - placement: `serverRunner`
- `auth.oauth`
  - placement: `serverRunner`
- `http.outbound`
  - placement: `context`, `serverRunner`
- `webhook.inbound`
  - placement: `serverRunner`
- `notify.email`
  - placement: `context`, `serverRunner`
- `notify.sms`
  - placement: `context`, `serverRunner`
- `search.index`
  - placement: `context`, `serverRunner`

These are product seams, not providers.

Providers remain implementation choices behind these capability ids.

---

## Foundation Contracts

These contracts must exist before later capability boxes can turn `[X]`.

### Runtime config contract

`runtime.config` owns:

- config schema
- secret references
- local defaults
- runtime binding
- safe inspector visibility

It does not expose raw secret values through ordinary read models or inspection surfaces.

### Provider-adapter contract

Every practical backend capability that touches the outside world must separate:

- product seam
- provider adapter

The product seam defines the public capability contract.

The provider adapter defines the concrete implementation for:

- local-disk
- SQLite
- Postgres
- MySQL
- stub OAuth
- stub email
- hosted object storage
- provider-specific HTTP integrations

### Side-effect witness contract

External side effects must witness:

- requested intent
- provider or target selected
- attempt
- success or failure
- external reference ids when they exist

Read-only observation or retry state may add more witnesses, but these fields are the minimum boundary.

### Backend authority contract

Backend capabilities must keep these powers explicit:

- filesystem read
- filesystem write
- network listen
- network fetch
- secret access
- provider credentials
- hosted asset visibility

The goal is to prevent hidden host powers from becoming the real product contract.

---

## Capability Dependency Graph

The dependency graph for section 6 is:

- `runtime.config`
  - no section-6 dependency
- `fs.blob`
  - depends on authority expectations
- `fs.stream`
  - depends on authority expectations
- `upload.asset`
  - depends on `fs.blob`
  - depends on `fs.stream`
  - often depends on `jobs.queue` for heavier or deferred processing
- `db.sql`
  - depends on `runtime.config`
- `jobs.queue`
  - depends on `runtime.config`
- `search.index`
  - depends on `db.sql` or another explicit record or asset source
  - may depend on `jobs.queue` for reindex work
- `auth.oauth`
  - depends on `runtime.config`
  - depends on the existing identity and session model
- `http.outbound`
  - depends on `runtime.config`
  - depends on the side-effect witness contract
- `webhook.inbound`
  - depends on `runtime.config`
  - depends on `jobs.queue`
  - depends on the side-effect witness contract
- `notify.email`
  - depends on `jobs.queue`
  - depends on `runtime.config`
- `notify.sms`
  - depends on `jobs.queue`
  - depends on `runtime.config`

Ordering consequence:

- `runtime.config` should arrive before `db.sql`, `jobs.queue`, `auth.oauth`, `http.outbound`, `webhook.inbound`, `notify.email`, and `notify.sms`
- `jobs.queue` should arrive before `notify.email`, `notify.sms`, and `webhook.inbound`
- `Files + Uploads` stays the active slice even though `runtime.config` is foundational, because it is the first visible product wave

---

## Witness Boundary Rules

These are the minimum witnessed boundary rules for section 6.

### Data access

For `db.sql`, witness:

- datasource resolved or selected
- migration apply attempt and result
- query or command attempt
- success or failure
- transaction begin and final result when a transaction boundary matters

### File and upload work

For `fs.blob`, `fs.stream`, and `upload.asset`, witness:

- requested path or logical asset target
- validation attempt and result
- persistence attempt
- success or failure
- stable asset id
- hosted visibility mode when relevant

### Outbound HTTP

For `http.outbound`, witness:

- target integration or endpoint
- request attempt
- retry attempt when applicable
- success or failure
- external response id or correlation id when it exists

### Webhooks

For `webhook.inbound`, witness:

- inbound receipt
- signature verification result
- replay detection result
- accepted handoff into jobs or process boundary
- rejection reason on failure

### Notifications

For `notify.email` and `notify.sms`, witness:

- outbox enqueue
- render or template attempt
- send attempt
- delivery success or failure
- provider message id when it exists

### OAuth

For `auth.oauth`, witness:

- auth flow start
- callback receipt
- identity link or create decision
- session establishment result
- failure reason on denial, mismatch, or callback failure

---

## Provider Strategy

Section 6 follows a strict provider strategy:

### Provider order

- local or stub provider first
- hosted provider second
- multiple hosted providers only after the seam is already honest

### Provider responsibilities

Providers implement:

- external API details
- local disk or local process behavior
- protocol quirks
- authentication with external systems
- provider-specific ids and failure mapping

The capability seam continues to own:

- public contract
- configuration surface
- witnessed boundary shape
- placement semantics
- authority visibility

### First providers by capability

- `runtime.config`
  - local env and runtime-bound config source
- `fs.blob`
  - local disk first
- `fs.stream`
  - local disk first
- `upload.asset`
  - local disk first
- `db.sql`
  - SQLite first
  - Postgres and MySQL as later adapters behind the same seam
- `jobs.queue`
  - local in-process worker first
- `auth.oauth`
  - local stub provider first
  - Google or GitHub later
- `http.outbound`
  - generic local test adapter first
- `webhook.inbound`
  - generic signed inbound adapter first
- `notify.email`
  - local stub transport first
- `notify.sms`
  - local stub transport first
- `search.index`
  - local text index first

---

## Test Strategy

Section 6 uses a layered test strategy.

### Layer 1. Local deterministic tests

These are required for any section-6 item to turn `[X]`.

They should cover:

- capability boundary behavior
- host integration
- failure and validation cases
- witnessed boundary events
- stub or local provider execution

### Layer 2. Adapter contract tests

These prove that non-local providers obey the same seam.

They should cover:

- provider-specific config binding
- provider error mapping
- returned external ids
- same capability-level witness contract

### Layer 3. Optional provider integration tests

These are useful later, but they are not required to start the seam.

They should be isolated so vendor flakiness does not become the main test story.

### Test philosophy

- local deterministic tests first
- host-level tests required for request-driven seams
- provider integration tests later
- no section-6 feature turns `[X]` on docs alone

---

## Capability Specifications

Each capability below uses the same contract fields:

- `publicApi`
- `config`
- `internals`
- `authority`
- `placement`
- `provider adapters`
- `witness contract`
- `stub/test mode`
- `dependencies`
- slice status
- completion criteria

### runtime.config

Slice status:

- foundation contract
- not in active first slice

`publicApi`

- define config schema for a runtime or capability
- bind concrete values or secret references
- resolve runtime config for capability use
- expose safe config metadata to inspectors

`config`

- schema definitions for named config fields
- secret-reference shape
- default values for local development where appropriate

`internals`

- runtime config resolver
- secret store adapter boundary
- redaction policy for inspectors and read models

`authority`

- secret access
- runtime environment access

`placement`

- `serverRunner`

`provider adapters`

- local environment and runtime-bound config source first

`witness contract`

- config resolution attempt
- missing config failure
- secret-reference resolution failure when applicable

`stub/test mode`

- local in-memory or env-backed config source
- explicit missing-secret and missing-config test cases

`dependencies`

- none inside section 6

Completion criteria:

- config schema exists
- secret refs are supported
- resolved config is available to runtime without exposing secret values in inspectors
- tests cover binding and missing-secret failure

### fs.blob

Slice status:

- active first slice

`publicApi`

- list folders
- read file metadata
- write file
- delete file
- move or copy file when needed
- return stable asset references instead of raw path-only semantics

`config`

- scoped root or namespace
- naming policy for stored assets
- visibility defaults when paired with hosting

`internals`

- path normalization
- scoped root enforcement
- asset id allocation
- metadata projection

`authority`

- filesystem.read
- filesystem.write

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local disk first
- hosted object store later through the same seam

`witness contract`

- requested logical target
- persistence attempt
- success or failure
- stable asset id

`stub/test mode`

- temp-root or in-memory local test fixture
- deterministic ids where feasible

`dependencies`

- backend authority contract

Completion criteria:

- folder, list, read, write, delete, and metadata work through the capability boundary
- scoped authority is enforced
- tests cover path restrictions and stable asset refs

### fs.stream

Slice status:

- active first slice

`publicApi`

- stream read
- stream write
- stream upload and download primitives
- stream copy or piping when needed for large payload flows

`config`

- streaming buffer or threshold policy only if needed
- scoped roots or namespaces when bound to local storage

`internals`

- stream lifecycle management
- teardown behavior on failure
- backpressure-safe adapter boundary

`authority`

- filesystem.read
- filesystem.write

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local disk first
- object-store streaming later

`witness contract`

- stream open attempt
- write or transfer attempt
- success or failure

`stub/test mode`

- deterministic large-payload fixture tests
- forced failure teardown tests

`dependencies`

- backend authority contract

Completion criteria:

- streaming upload and download work without forcing full-buffer behavior
- tests cover large payload flow and failure teardown

### upload.asset

Slice status:

- active first slice

`publicApi`

- receive browser upload
- validate type and size
- persist into a configured storage target
- return asset reference
- serve private or public URL through the host

`config`

- allowed mime types
- size limits
- default visibility
- target storage binding

`internals`

- multipart or equivalent upload parsing
- staging area
- validation pipeline
- host serving integration

`authority`

- filesystem.write or storage write
- filesystem.read or storage read
- network.listen through the existing host seam

`placement`

- `serverRunner`

`provider adapters`

- local disk first
- hosted object storage later

`witness contract`

- upload receive attempt
- validation result
- persistence attempt
- success or failure
- asset id
- visibility mode

`stub/test mode`

- deterministic browser-to-host upload tests
- invalid type and invalid size tests

`dependencies`

- `fs.blob`
- `fs.stream`
- often `jobs.queue` for heavier deferred processing

Completion criteria:

- multipart intake or equivalent browser upload path is supported
- validation and persistence are witnessed
- private and public serving is explicit
- tests cover invalid type or size and hosted retrieval

### db.sql

Slice status:

- data and async substrate
- not in active first slice

`publicApi`

- define datasource
- run migrations
- execute named query
- execute named command
- transaction wrapper

`config`

- provider type
- connection binding
- migration location or migration definitions

`internals`

- datasource lifecycle
- transaction execution
- provider adapter mapping

`authority`

- secret access
- filesystem.read for local SQLite paths when relevant
- network.fetch or equivalent provider connectivity for remote databases when relevant

`placement`

- `context`
- `serverRunner`

`provider adapters`

- SQLite first
- Postgres later
- MySQL later

`witness contract`

- datasource resolution
- migration apply attempt and result
- query or command attempt
- success or failure
- transaction boundary result when used

`stub/test mode`

- SQLite first
- one adapter-contract test shape preserved for Postgres and MySQL

`dependencies`

- `runtime.config`

Completion criteria:

- datasource definition exists
- migration apply exists
- query and command execution exist
- transaction wrapper exists
- tests cover SQLite first plus one adapter contract test shape for Postgres and MySQL

### jobs.queue

Slice status:

- data and async substrate
- not in active first slice

`publicApi`

- enqueue job
- delay job
- retry job
- inspect job status
- dead-letter failed job

`config`

- queue backend binding
- retry policy
- idempotency policy

`internals`

- worker loop
- retry scheduler
- dead-letter tracking
- idempotency store

`authority`

- secret or provider access when external queue backends arrive
- runtime scheduling authority

`placement`

- `serverRunner`

`provider adapters`

- local in-process worker first
- external queue later if needed

`witness contract`

- enqueue
- execution start
- retry
- success or failure
- dead-letter final state

`stub/test mode`

- deterministic in-process queue
- fake clock or deterministic delay handling where practical

`dependencies`

- `runtime.config`

Completion criteria:

- enqueue, retry, delayed execution, and idempotency are supported
- tests cover retry, backoff, and dead-letter behavior

### auth.oauth

Slice status:

- identity and external integrations
- not in active first slice

`publicApi`

- start auth flow
- receive callback
- map external identity to internal identity
- create or link internal identity
- establish session

`config`

- provider credentials
- callback URL binding
- provider mapping policy

`internals`

- state or nonce handling
- callback verifier
- identity-link resolver

`authority`

- secret access
- network.fetch

`placement`

- `serverRunner`

`provider adapters`

- local stub provider first
- Google or GitHub later

`witness contract`

- flow start
- callback receipt
- identity link or create decision
- session establishment result
- failure reason when it fails

`stub/test mode`

- deterministic stub-provider success and failure flows

`dependencies`

- `runtime.config`
- existing identity and session model

Completion criteria:

- start flow, callback, identity link or create, and session establishment exist
- tests cover stub-provider success or failure and account linking

### http.outbound

Slice status:

- identity and external integrations
- not in active first slice

`publicApi`

- send signed or configured outbound request
- retry request
- return normalized response metadata

`config`

- endpoint config
- auth config
- retry policy
- timeout policy

`internals`

- request signer
- retry loop
- correlation-id propagation

`authority`

- network.fetch
- secret access

`placement`

- `context`
- `serverRunner`

`provider adapters`

- generic local test adapter first
- provider-bound integrations later

`witness contract`

- target endpoint or integration
- request attempt
- retry attempt
- success or failure
- response or correlation id when present

`stub/test mode`

- deterministic local adapter
- forced timeout and retry cases

`dependencies`

- `runtime.config`
- side-effect witness contract

Completion criteria:

- signed request execution, retry, and result witnessing exist
- tests cover timeout, failure, and retry behavior

### webhook.inbound

Slice status:

- identity and external integrations
- not in active first slice

`publicApi`

- receive inbound webhook
- verify signature
- reject replay
- hand accepted event into jobs or process boundary

`config`

- secret binding
- signature policy
- replay window policy

`internals`

- verifier
- replay store
- handoff bridge to jobs or process boundary

`authority`

- network.listen through the existing host seam
- secret access

`placement`

- `serverRunner`

`provider adapters`

- generic signed inbound adapter first
- provider-specific webhook shapes later

`witness contract`

- receipt
- verification result
- replay result
- accepted handoff or rejection

`stub/test mode`

- deterministic signature and replay fixtures

`dependencies`

- `runtime.config`
- `jobs.queue`
- side-effect witness contract

Completion criteria:

- signature verification, replay protection, and job or process handoff exist
- tests cover invalid signatures and duplicate delivery

### notify.email

Slice status:

- identity and external integrations
- not in active first slice

`publicApi`

- enqueue email
- preview rendered email in local mode
- attempt delivery

`config`

- provider credentials
- sender defaults
- template binding

`internals`

- outbox
- renderer
- delivery adapter
- retry integration

`authority`

- secret access
- provider network access

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local stub transport first
- real provider later

`witness contract`

- outbox enqueue
- render attempt
- send attempt
- success or failure
- provider message id when present

`stub/test mode`

- local preview and fake send path

`dependencies`

- `jobs.queue`
- `runtime.config`

Completion criteria:

- outbox enqueue, stub preview, delivery attempt, and failure state exist
- tests cover template or render failure and retry

### notify.sms

Slice status:

- identity and external integrations
- not in active first slice

`publicApi`

- enqueue SMS
- preview rendered SMS in local mode
- attempt delivery

`config`

- provider credentials
- sender defaults
- template binding

`internals`

- outbox
- renderer
- delivery adapter
- retry integration

`authority`

- secret access
- provider network access

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local stub transport first
- real provider later

`witness contract`

- outbox enqueue
- render attempt
- send attempt
- success or failure
- provider message id when present

`stub/test mode`

- local preview and fake send path

`dependencies`

- `jobs.queue`
- `runtime.config`

Completion criteria:

- outbox enqueue, stub preview, delivery attempt, and failure state exist
- tests cover template or render failure and retry

### search.index

Slice status:

- data and async substrate
- not in active first slice

`publicApi`

- build index
- reindex
- query index

`config`

- source bindings
- tokenizer or local index policy
- reindex policy

`internals`

- index store
- reindex worker
- query bridge

`authority`

- filesystem.write when local index files exist
- filesystem.read when local index files exist

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local text index first

`witness contract`

- index build attempt
- reindex attempt
- success or failure
- query result metadata when useful

`stub/test mode`

- deterministic local index fixtures

`dependencies`

- `db.sql` or another explicit record or asset source
- often `jobs.queue` for reindex work

Completion criteria:

- index build, reindex, and query path exist
- tests cover stale-index rebuild and query correctness

---

## Per-Capability Completion Criteria

No roadmap box in section 6 should turn `[X]` until the corresponding capability satisfies all of the following:

- explicit capability definition exists
- placement is explicit and matches this document
- provider path exists for the declared first implementation
- witnessed boundary events exist and match this document
- local deterministic tests exist
- host-level tests exist when the capability is request-driven or hosting-driven
- the seam is still honest about provider adapters versus product contract

For the active first slice, completion additionally requires:

- `fs.blob`, `fs.stream`, and `upload.asset` each have explicit capability definitions
- a local provider path exists
- witnessed boundary events exist
- host-level tests exist

---

## Product Honesty and Operability Rules

Section 6 must stay truthful in these ways:

- external systems remain proxy-shaped rather than hidden truth stores
- backend seams stay stub-first where vendor lock-in would otherwise block product work
- capability config and provider status must become operator-visible once runtime slices exist
- failed side effects must be inspectable
- bootstrap or inspection surfaces for practical backend capabilities should arrive after the first runtime slice is real

This seam must not become "just wire libraries into handlers."

---

## Explicit Non-Goals

Do not overload the first section-6 implementation waves with:

- an ORM-first product model
- vendor-first modeling
- hidden side stores as product truth
- every cloud vendor on day one
- multi-region distributed systems semantics
- a perfect long-term authority model for every external system before any practical seam exists

The first job is simpler:

- identify the real reusable backend seams
- make them explicit capability surfaces
- keep them stubbable, inspectable, and provider-backed
- require honest runtime behavior and tests before claiming completion
