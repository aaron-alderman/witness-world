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
- session read/open/logout plus authority-grant inspection/mutation on the generic host
- the maintained demo serve path now runs on `minimal` plus authored runtime-plugin installs rather than only relying on the implicit `full` profile
- shipped backend capability envelopes currently provided through runtime bundle/profile composition:
  - `runtime.config`
  - `http.serve`
  - `fs.json.read`
  - `fs.json.write`
  - `fs.blob`
  - `fs.stream`
  - `upload.asset`
  - `db.sql`
  - `jobs.queue`
  - `auth.oauth`
  - `search.index`
  - `http.outbound`
  - `webhook.inbound`
  - `notify.email`
  - `notify.sms`
- authored MCP transport and tool surfaces through `mcpServer` + `mcpToolInstall`
- many shipped demo/backend routes now execute through authored `backendProgram` definitions instead of raw handler-set glue
- the remaining demo/runtime compatibility seam is explicit: `serverRunner.handlerSet = "demo"` still causes startup to add `bundle-demo`, and that ownership is now reported honestly in runtime diagnostics
- several shipped backend-program versions still call demo handler-set model helpers such as `todos.*Model`, `privateNotes.*Model`, `widgets.createModel`, and `network.simulateModel`, so the remaining app-logic compatibility seam is narrower than before but not gone yet

That is an honest baseline.

It is not yet a practical backend capability surface for ordinary product work.

The next seam should therefore not be "more hidden handlers."

It should be explicit capability seams that make common product needs composable.

Shipped runtime status so far:

- `serverRunner.runtimeConfig` is now a shipped backend capability binding surface
- `runtimeConfigJson` is accepted on bootstrap server-runner authoring and projects back through `serverRunner`
- runtime config resolution supports:
  - direct scalar values
  - object entries with `value`, `default`, `secret`, `required`, and `expose`
- required secret references resolve from environment at startup and block server start honestly when unresolved
- `GET /api/runtime-config` exposes safe inspection for the active `serverRunner`
- runtime config inspection returns exposed resolved values only, plus redacted field metadata for secret-backed entries
- `GET /api/backend-seams` and `GET /backend-seams` include runtime-config field counts and missing-config counts
- `POST /api/jobs`, `GET /api/jobs`, and `GET /api/jobs/:id` expose `jobs.queue` through the generic host
- `jobs.queue` supports:
  - in-process serverRunner-scoped job execution reconstructed from witnessed state
  - delayed execution through witnessed `availableAt` scheduling
  - idempotent enqueue through witnessed `idempotencyKey`
  - retry with witnessed backoff and dead-letter final state
- `GET /api/backend-seams` and `GET /backend-seams` now also expose queue counts and recent dead-letter failures
- `GET /api/db/sql`, `POST /api/db/sql/migrate`, `POST /api/db/sql/query`, `POST /api/db/sql/command`, and `POST /api/db/sql/transaction` expose `db.sql` through the generic host
- `db.sql` currently supports:
  - local SQLite datasource resolution through `runtime.config`
  - witnessed migration apply with idempotent skip tracking through a local migration ledger table
  - witnessed query, command, and transaction execution
  - operator-visible datasource, operation, provider, and failure counts through `/api/backend-seams`
  - explicit unsupported adapter boundaries for Postgres and MySQL instead of pretending those providers are already live
- `GET /api/search/index`, `POST /api/search/index/build`, `POST /api/search/index/reindex`, and `POST /api/search/index/query` expose `search.index` through the generic host
- `search.index` currently supports:
  - a shipped local-text provider path backed by world-managed local storage under `<runtimeRoot>/search` unless `serverRunner.storage.searchRoot` is configured
  - explicit document sources and asset-backed sources for index build and reindex
  - witnessed index build, reindex, and query activity with query and failure counts visible through `/api/backend-seams`
  - stale-index rebuild against changed asset bytes rather than pretending the index updates itself magically
- `POST /api/oauth/start`, `GET /api/oauth/callback/:provider`, `GET /api/oauth/links`, and `GET /api/oauth/links/:id` expose `auth.oauth` through the generic host
- `auth.oauth` currently supports:
  - runtime-config-backed provider selection with a shipped local `stub` adapter
  - witnessed flow start, callback receipt, account-link decision, and session establishment
  - linking a provider account onto the current signed-in identity without replacing the current identity model
  - auto-creating a new internal identity for first-time stub logins when no link exists
  - operator-visible OAuth link and failure counts through `/api/backend-seams`
- `POST /api/http/outbound`, `GET /api/http/outbound`, and `GET /api/http/outbound/:id` expose `http.outbound` through the generic host
- `http.outbound` currently supports:
  - serverRunner-scoped outbound calls witnessed as first-class `outboundRequest` things
  - runtime-config-backed bearer or header signing without witnessing secret values
  - retry for timeout, `429`, and `5xx` responses
  - deterministic `stub://` adapters for echo, fixed-status, flaky, and timeout cases
  - operator-visible outbound counts and recent request or terminal failures through `/api/backend-seams`
- `POST /api/webhooks/inbound/:target`, `GET /api/webhooks`, and `GET /api/webhooks/:id` expose `webhook.inbound` through the generic host
- `webhook.inbound` currently supports:
  - signature verification and replay protection with runtime-config-backed secret binding
  - persisted local payload storage plus first-class `webhookDelivery` things
  - handoff into `jobs.queue` with retry and terminal failure visibility
  - operator-visible webhook counts and recent verification or processing failures through `/api/backend-seams`
- `POST /api/notify/email`, `POST /api/notify/sms`, `GET /api/notifications`, and `GET /api/notifications/:id` expose stub notification delivery through the generic host
- `notify.email` and `notify.sms` support:
  - witnessed outbox enqueue as first-class `notification` things
  - rendered preview text in the local stub path
  - delivery through `jobs.queue` with retry and dead-letter behavior
  - operator-visible notification counts and render-failure diagnostics through `/api/backend-seams`
- `POST /api/mcp-servers`, `POST /api/mcp-tool-installs`, `DELETE /api/mcp-tool-installs`, and `POST /mcp/:id` expose the first MCP operator/automation surface through the generic host
- the shipped MCP slice currently supports:
  - authored `mcpServer` definitions bound to an existing `serverRunner`
  - authored `mcpToolInstall` rows that choose a tool family, acting mode, and optional `scopeContexts` / `scopeTargets`
  - local-first `stdio` and HTTP transports
  - delegated mode using the requesting authority tuple and service mode using the same runtime authority tuple with `authorityMode = "service"` and `mcpServer.serviceIdentity` as the canonical actor
  - runtime-config-backed bearer auth for HTTP service mode through `mcp.<serverId>.token`
  - MCP lifecycle and tools methods for `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`
  - a first tool catalog over real witnessed seams such as world reads, authoring/proposals, canvas, blobs/streams/assets, runtime config, SQL, search, jobs, outbound HTTP, webhooks, and notifications
  - tool visibility filtered by acting mode and current backend capability availability instead of pretending every server always exposes every tool
  - local scope enforcement layered on top of normal world authority so an MCP install can be narrower than the underlying actor
- the shipped MCP slice intentionally does not yet support:
  - arbitrary shell or process execution
  - prompts/resources/completions
  - HTTP streaming GET/SSE transport
  - OAuth discovery or broader remote authorization metadata
- `PUT /api/fs/blobs/content`, `GET /api/fs/blobs/content`, `GET /api/fs/blobs`, `GET /api/fs/blobs/meta`, and `DELETE /api/fs/blobs` expose `fs.blob` through the generic host
- blob writes persist to world-managed local storage at `<runtimeRoot>/blobs` unless `serverRunner.storage.blobsRoot` is configured
- `fs.blob` supports:
  - context-scoped blob storage with context authority enforcement
  - serverRunner-scoped blob storage with serverRunner authority enforcement
  - stable blob refs, metadata, folder listing, content reads, writes, and recursive folder delete
- `PUT /api/fs/streams/content`, `GET /api/fs/streams/content`, and `POST /api/fs/streams/copy` expose `fs.stream` through the generic host
- `fs.stream` supports:
  - streamed writes into world-managed local storage without buffering the full request body
  - streamed reads from local storage back through the generic host
  - streamed file copy inside a scoped local provider path
  - deterministic local failure injection for teardown tests
- `POST /api/assets` accepts either raw file bytes with filename/content-type headers or multipart form-data uploads with a file part
- uploaded bytes persist to world-managed local storage at `<runtimeRoot>/assets` unless `serverRunner.storage.assetsRoot` is configured
- `GET /api/assets/:id/content` serves private or public asset content back through the generic host
- `GET /api/assets/:id/text` serves derived asset text back through the generic host when queued ingestion has produced it
- `GET /api/assets/:id/thumbnail` serves derived thumbnail artifacts back through the same private/public host boundary when queued ingestion has produced them
- `GET /api/assets/:id/content?download=1` serves the same asset through explicit attachment/download disposition
- `GET /api/assets/:id/attachments`, `POST /api/assets/:id/attachments`, and `DELETE /api/assets/:id/attachments` expose first-class asset attachment semantics through the generic host
- `POST /api/assets/:id/ingest/retry` exposes operator-visible asset-ingestion retry through the generic host
- `POST /api/assets/:id/search/reindex` exposes operator-visible repair for stale asset-backed search refresh through the generic host
- the shipped public-serving extension is explicit and opt-in through `upload.asset.publicEnabled`
- `GET /api/backend-seams` and `GET /backend-seams` expose operator-visible inspection for the shipped asset seam:
  - installed backend capabilities
  - resolved asset storage root and whether it exists
  - current public/private asset counts and discovered `Files` contexts
  - current attachment counts
  - raw versus multipart upload counts plus total stored asset bytes
  - stream write/copy counts, drain counts, and max observed chunk size
  - recent `asset.upload.failed`, `asset.attach.failed`, `asset.content.read.failed`, `asset.text.read.failed`, `asset.thumbnail.read.failed`, `fs.blob.*.failed`, and `fs.stream.*.failed` events
- dropping files on the canvas creates `asset` things, uploads bytes, and places standalone asset nodes
- asset drops resolve context from the selected perspective first, then fall back to `homeContext -> Files`
- if no surface context and no `homeContext` exist, the upload is rejected clearly
- asset metadata, context, and placement are witnessed; bytes do not live in witnesses
- assets can now attach to other world things through an explicit `attachedAsset` relation instead of ad hoc filename or path fields
- queued asset ingestion now derives structured text, first-slice PDF text, image metadata, and local thumbnail artifacts for supported files instead of leaving uploads as raw blobs only
- queued asset ingestion now also derives structured metadata summaries for supported document and structured-text uploads, including first-slice PDF page facts, CSV table facts, and markdown heading or frontmatter facts
- the current canvas inspector slice exposes open/download links, derived-text links, honest typed preview for image, smaller text assets, derived asset text, derived metadata facts, plus attach/detach controls for other world things

---

## Locked Decisions

- Roadmap boxes in section 6 turn `[X]` only when runtime behavior, tests, and honest capability boundaries exist.
- The active starting slice is `Files + Uploads`.
- The roadmap should show sequence, phases, and completion rules.
- This document is the detailed operating spec for section 6.
- Existing capability mechanics in `src/modules.js`, the runtime bundle/profile composition path, and the public host/runtime facade remain the baseline contract that section 6 extends.

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
- explicit private hosting plus runner-gated public asset hosting through the generic host
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
- an explicit automation/operator transport that stays inside the same witnessed authority and capability model
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
- attachment target when an existing asset is associated with another world thing
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
- shipped runtime slice
- not in active first slice

`publicApi`

- define config schema for a runtime or capability
- bind concrete values or secret references
- resolve runtime config for capability use
- expose safe config metadata to inspectors
- serve safe inspection for the active runner through `GET /api/runtime-config`

`config`

- schema definitions for named config fields
- secret-reference shape
- default values for local development where appropriate
- current shipped entry shape supports:
  - scalar shorthand values
  - object entries with `value`, `default`, `secret`, `required`, and `expose`

`internals`

- runtime config resolver
- secret store adapter boundary
- redaction policy for inspectors and read models
- current shipped storage/binding path is `serverRunner.runtimeConfig`
- bootstrap authoring accepts `runtimeConfigJson`

`authority`

- secret access
- runtime environment access
- server-runner mutation authority for runtime-config inspection

`placement`

- `serverRunner`

`provider adapters`

- local environment and runtime-bound config source first
- current shipped secret source is process environment

`witness contract`

- current shipped runtime witnesses unresolved config through `server.start.failed`
- current shipped runtime witnesses safe inspection reads through `runtimeConfig.read`
- current shipped runtime witnesses inspection failures through `runtimeConfig.read.failed`

`stub/test mode`

- local in-memory or env-backed config source
- explicit missing-secret and missing-config test cases
- current shipped tests cover env-backed resolution, safe redaction, and missing-secret startup failure

`dependencies`

- none inside section 6

Completion criteria:

- config schema exists
- secret refs are supported
- resolved config is available to runtime without exposing secret values in inspectors
- tests cover binding and missing-secret failure
- current shipped slice meets these criteria

### fs.blob

Slice status:

- active first slice
- shipped runtime slice

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
- stable blob ref

`stub/test mode`

- temp-root or in-memory local test fixture
- deterministic ids where feasible

Current shipped runtime:

- `PUT /api/fs/blobs/content`
  - raw bytes request body
  - requires exactly one scope:
    - `context`
    - `serverRunner`
  - requires `path`
  - uses request `content-type` or defaults to `application/octet-stream`
- `GET /api/fs/blobs/content`
  - returns blob bytes for a scoped path
- `GET /api/fs/blobs`
  - lists a scoped folder, defaulting to the scope root
- `GET /api/fs/blobs/meta`
  - returns metadata for a file or folder path
- `DELETE /api/fs/blobs`
  - deletes a file path
  - deletes a folder path when `recursive=true`
- local provider storage lives under `<blobsRoot>/<scope>/<scopeId>/<path...>/blob`
- metadata lives beside blob content in local provider storage
- stable refs are returned as `blob:<scopeKind>:<scopeId>:<path...>`
- path traversal is rejected
- context-scoped access is governed by context authority
- serverRunner-scoped access is governed by serverRunner authority

`dependencies`

- backend authority contract

Completion criteria:

- folder, list, read, write, delete, and metadata work through the capability boundary
- scoped authority is enforced
- tests cover path restrictions and stable asset refs

### fs.stream

Slice status:

- active first slice
- shipped runtime slice

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
- forced failure teardown tests through local failure injection

Current shipped runtime:

- `PUT /api/fs/streams/content`
  - raw bytes request body
  - requires exactly one scope:
    - `context`
    - `serverRunner`
  - requires `path`
  - streams request bytes into local provider storage without buffering the full body first
- `GET /api/fs/streams/content`
  - streams blob bytes back to the client for a scoped path
- `POST /api/fs/streams/copy`
  - copies one scoped file path to another through stream piping
- the local provider path is shared with `fs.blob`
- deterministic failure injection is available for host tests through `x-witness-stream-fail-after-bytes`
- failed writes and copies tear down newly created partial targets
- write/copy witnesses now include chunk, drain, and high-water-mark metrics so the seam exposes real streaming behavior rather than only final byte counts
- asset upload now uses the same streamed local-write path rather than buffering the full upload body in memory

`dependencies`

- backend authority contract

Completion criteria:

- streaming upload and download work without forcing full-buffer behavior
- tests cover large payload flow and failure teardown

### upload.asset

Slice status:

- active first slice
- shipped runtime slice

`publicApi`

- receive browser upload
- validate type and size
- persist into a configured storage target
- return asset reference
- serve private or public URL through the host
- serve explicit download disposition through the host
- attach or detach an existing asset from another world thing through a first-class witnessed relation

`config`

- allowed mime types
- size limits
- default visibility
- target storage binding
- current shipped runtime config keys:
  - `upload.asset.publicEnabled`
  - `upload.asset.thumbnailMaxSourceBytes`
  - `upload.asset.thumbnailMaxEdgePx`
- current shipped storage binding:
  - `serverRunner.storage.assetsRoot`

`internals`

- multipart or equivalent upload parsing
- staging area
- validation pipeline
- host serving integration

Current shipped runtime:

- `POST /api/assets`
  - accepts either:
    - raw bytes request body with `x-witness-file-name` and `content-type`
    - multipart form-data with a `file` part plus optional `perspective`, `dropContext`, and `visibility` fields
  - requires selected perspective via query
  - `x-witness-visibility: public` is accepted only when `upload.asset.publicEnabled` is true for the runner
  - streams request bytes to local storage through the `fs.stream` local provider path
  - witnesses upload kind, declared size, and stream metrics in addition to asset identity and storage refs
  - queues `asset.ingest.process` through `jobs.queue` after the upload witness succeeds
  - returns immediate processing state plus job id when async ingestion has been queued
- `GET /api/assets/:id/content`
  - private by default
  - public assets can be read without a session through the same host content route
  - private assets still require authenticated access and target authority
  - `?download=1` switches the response to attachment disposition without changing the asset id or storage key
- `GET /api/assets/:id/text`
  - serves derived text when queued ingestion has produced a `textRef`
  - uses the same private/public access policy as asset content reads
  - returns `404` when no derived text has been produced rather than pretending every asset is text-readable
- `GET /api/assets/:id/thumbnail`
  - serves a derived thumbnail artifact when queued ingestion has produced one
  - uses the same private/public access policy as asset content reads
  - the current shipped local thumbnail provider writes SVG-backed thumbnail artifacts for supported image uploads
- `GET /api/assets/:id/attachments`
  - lists the current world things attached to the asset
  - requires authenticated authority over the asset
- `POST /api/assets/:id/attachments`
  - accepts a target thing id
  - creates a witnessed `asset.attach` relation instead of stashing file references inside another record shape
- `DELETE /api/assets/:id/attachments`
  - removes the current attachment relation for a target thing id
- `POST /api/assets/:id/ingest/retry`
  - requires authenticated authority over the asset
  - enqueues a fresh `asset.ingest.process` job when no current ingest job is already active
  - keeps the retry action explicit instead of requiring an operator to hand-author a generic queue payload
- `POST /api/assets/:id/search/reindex`
  - requires authenticated mutation authority over the current `serverRunner`
  - repairs a stale indexed asset through the existing `search.index` seam instead of a hidden side path
  - rejects the request clearly when no index exists or the asset is not part of the current index
- asset metadata is witnessed through `asset.upload`
- queued text-first derived processing is witnessed through:
  - `asset.ingest.enqueue`
  - `asset.ingest.retry`
  - `asset.ingest.start`
  - `asset.ingest.succeeded`
  - `asset.ingest.failed`
- asset-specific operator repair is also witnessed through:
  - `asset.search.reindex`
  - `asset.search.reindex.failed`
- asset content reads are observed through `asset.content.read`
- derived text reads are observed through `asset.text.read`
- thumbnail reads are observed through `asset.thumbnail.read`
- asset attachment writes are witnessed through `asset.attach` and `asset.detach`
- successful text-first ingestion writes derived text to local world-managed storage rather than putting extracted bytes into witnesses
- successful text-first ingestion now also writes structured `derivedMetadata` facts into the ingest-success witness body so projections can expose them without introducing a side table
- successful image ingestion now also writes derived thumbnail artifacts to local world-managed storage for supported image uploads
- the current shipped structured extractors are:
  - `json`
  - `csv`
  - `tsv`
  - `pdf`
  - markup-style text (`html`, `xml`, `svg`)
  - plain-text fallback
- the current shipped image metadata and thumbnail path supports:
  - intrinsic width and height projection for `png`, `gif`, `jpeg`, and `svg`
  - local SVG-backed thumbnail artifacts for supported images within the configured thumbnail source-size limit
- asset operators can inspect the current slice through:
  - `GET /api/backend-seams`
  - `GET /backend-seams`
- canvas drag and drop is the first product entry point
- context association is automatic:
  - perspective context first
  - fallback `homeContext -> Files` context second
  - clear rejection if neither path resolves
- asset projections now derive:
  - stable `downloadUrl`
  - optional `textUrl`
  - optional `derivedMetadata`
  - optional `thumbnailUrl` and `thumbnailRef`
  - optional `imageWidth` and `imageHeight`
  - `attachedTo` target ids on the asset
  - attached-asset rows on other projected world things
  - async processing state, derived text refs, and asset-backed search refresh status
- the current canvas inspector exposes:
  - file open/download links
  - derived-text links when ingestion has produced a text artifact
  - honest image preview and bounded text preview
  - derived-text preview for non-text-native assets such as first-slice PDF extraction when the runtime can really serve it
  - derived metadata facts such as PDF page count, CSV row and column counts, and JSON top-level shape when the current extractor can honestly derive them
  - image dimensions and thumbnail-processing state when present
  - attach/detach controls so uploaded files can become references on other world things without becoming hidden route glue
  - current asset processing state, derived text status, and search refresh status when present
  - human-readable processing and search summaries derived from those witnessed states
  - asset-local `Retry ingest` and `Refresh search` actions when the current projected asset state makes repair honest
- the current backend-seams page now also exposes:
  - retryable asset-ingestion rows with direct retry actions
  - stale asset-backed search rows with direct repair actions

`authority`

- filesystem.write or storage write
- filesystem.read or storage read
- network.listen through the existing host seam

`placement`

- `serverRunner`

`provider adapters`

- local disk first
- hosted object storage later
- the current shipped provider path is local disk plus host-served public/private delivery

`witness contract`

- upload receive attempt
- validation result
- persistence attempt
- content read attempt
- asset attachment add/remove attempt
- success or failure
- asset id
- visibility mode

`stub/test mode`

- deterministic browser-to-host upload tests
- raw and multipart upload tests plus raw upload failure tests for missing filename, empty body, and context-resolution rejection
- asset attachment create/list/remove tests over the generic host
- queued derived-text and image-thumbnail ingestion tests over upload and explicit queue handoff
- derived-metadata tests for supported structured-text and document uploads
- private hosted retrieval tests
- private derived-text retrieval tests
- private thumbnail retrieval tests
- public mode tests for disabled and enabled runner configurations
- browser drag-and-drop tests for single-file, multi-file, fallback `Files` context flows, derived-text preview in the canvas inspector, and attachment from the canvas inspector

`dependencies`

- `fs.blob`
- `fs.stream`
- `jobs.queue` for the shipped text-first async ingestion slice and later heavier deferred processing

Completion criteria:

- multipart intake or equivalent browser upload path is supported
- validation and persistence are witnessed
- serving policy is explicit
- tests cover raw upload failure cases, context resolution, and hosted retrieval

### db.sql

Slice status:

- data and async substrate
- shipped runtime slice
- not in active first slice

`publicApi`

- inspect datasource and recent operations
- run migrations
- execute query
- execute command
- execute transaction
- current shipped host surface:
  - `GET /api/db/sql`
  - `POST /api/db/sql/migrate`
  - `POST /api/db/sql/query`
  - `POST /api/db/sql/command`
  - `POST /api/db/sql/transaction`
- current shipped runtime surface:
  - `appContext.dbSql.inspect()`
  - `appContext.dbSql.migrate({ migrations })`
  - `appContext.dbSql.query({ sql, params })`
  - `appContext.dbSql.command({ sql, params })`
  - `appContext.dbSql.transaction({ steps })`

`config`

- provider type
- connection binding
- migration location or migration definitions
- current shipped runtime config keys:
  - `db.sql.provider`
  - `db.sql.datasource`
  - `db.sql.migrationTable`
  - `db.sql.sqlite.path`
  - `db.sql.connectionString`
  - `db.sql.postgres.connectionString`
  - `db.sql.mysql.connectionString`

`internals`

- datasource lifecycle
- transaction execution
- provider adapter mapping
- current shipped SQLite runtime uses `node:sqlite`, caches datasource handles by resolved path, and records applied migrations in a local ledger table
- current shipped Postgres and MySQL paths stay explicit unsupported adapter boundaries until real provider wiring lands

`authority`

- secret access
- filesystem.read for local SQLite paths when relevant
- network.fetch or equivalent provider connectivity for remote databases when relevant
- filesystem.write for local SQLite database and migration-ledger paths
- serverRunner mutation authority for the generic host execution and inspection routes

`placement`

- `context`
- `serverRunner`

`provider adapters`

- SQLite first
- explicit Postgres adapter boundary now exists but is not yet a live provider path
- explicit MySQL adapter boundary now exists but is not yet a live provider path

`witness contract`

- datasource resolution
- migration apply attempt and result
- query or command attempt
- success or failure
- transaction boundary result when used
- current shipped witness processes:
  - `db.sql.datasource.resolve`
  - `db.sql.datasource.resolve.failed`
  - `db.sql.migrate`
  - `db.sql.migrate.failed`
  - `db.sql.query`
  - `db.sql.query.failed`
  - `db.sql.command`
  - `db.sql.command.failed`
  - `db.sql.transaction`
  - `db.sql.transaction.failed`

`stub/test mode`

- SQLite first
- one adapter-contract test shape preserved for Postgres and MySQL
- current shipped tests cover:
  - SQLite inspection, migration apply and idempotent skip, query, command, and transaction execution
  - rollback on failed transaction
  - explicit Postgres/MySQL unsupported-adapter inspection and failure mapping

`dependencies`

- `runtime.config`

Completion criteria:

- datasource definition exists
- migration apply exists
- query and command execution exist
- transaction wrapper exists
- tests cover SQLite first plus one adapter contract test shape for Postgres and MySQL
- the current shipped slice meets these criteria

### jobs.queue

Slice status:

- data and async substrate
- shipped runtime slice
- not in active first slice

`publicApi`

- enqueue job
- delay job
- retry job
- inspect job status
- dead-letter failed job
- current shipped host surface:
  - `POST /api/jobs`
  - `GET /api/jobs`
  - `GET /api/jobs/:id`
- current shipped runtime surface:
  - `appContext.jobs.enqueue(...)`
  - `appContext.jobs.list()`
  - `appContext.jobs.get(id)`

`config`

- queue backend binding
- retry policy
- idempotency policy
- current shipped runtime config keys:
  - `jobs.queue.pollMs`
  - `jobs.queue.maxAttempts`
  - `jobs.queue.retryDelayMs`

`internals`

- worker loop
- retry scheduler
- dead-letter tracking
- idempotency store
- current shipped worker reconstructs due jobs from witnessed queue state instead of a hidden side table

`authority`

- secret or provider access when external queue backends arrive
- runtime scheduling authority
- serverRunner mutation authority for generic host enqueue and inspection endpoints

`placement`

- `serverRunner`

`provider adapters`

- local in-process worker first
- external queue later if needed
- the local in-process worker is the shipped provider path

`witness contract`

- enqueue
- execution start
- retry
- success or failure
- dead-letter final state
- current shipped processes:
  - `jobs.queue.enqueue`
  - `jobs.queue.start`
  - `jobs.queue.retry`
  - `jobs.queue.succeeded`
  - `jobs.queue.deadLetter`
  - `jobs.queue.enqueue.failed`
  - `jobs.queue.list`
  - `jobs.queue.list.failed`
  - `jobs.queue.read`
  - `jobs.queue.read.failed`

`stub/test mode`

- deterministic in-process queue
- fake clock or deterministic delay handling where practical
- current shipped tests use deterministic demo job handlers for success, retry-once, and always-fail paths

`dependencies`

- `runtime.config`

Completion criteria:

- enqueue, retry, delayed execution, and idempotency are supported
- tests cover retry, backoff, and dead-letter behavior
- current shipped slice meets these criteria

### auth.oauth

Slice status:

- identity and external integrations
- shipped runtime slice
- not in active first slice

`publicApi`

- start auth flow
- receive callback
- map external identity to internal identity
- create or link internal identity
- establish session
- current shipped host surface:
  - `POST /api/oauth/start`
  - `GET /api/oauth/callback/:provider`
  - `GET /api/oauth/links`
  - `GET /api/oauth/links/:id`

`config`

- provider credentials
- callback URL binding
- provider mapping policy
- current shipped runtime config keys:
  - `auth.oauth.provider`
  - `auth.oauth.autoCreate`
  - `auth.oauth.callbackBaseUrl`

`internals`

- state or nonce handling
- callback verifier
- identity-link resolver
- current shipped runtime keeps pending stub flow state in the server-runner app context, resolves a deterministic stub profile on callback, and then either links onto the signed-in identity or opens a session for an existing or newly created internal identity

`authority`

- secret access
- network.fetch
- serverRunner mutation authority for operator inspection endpoints

`placement`

- `serverRunner`

`provider adapters`

- local stub provider first
- Google or GitHub later
- the current shipped provider path is `stub`

`witness contract`

- flow start
- callback receipt
- identity link or create decision
- session establishment result
- failure reason when it fails
- current shipped witness processes:
  - `auth.oauth.start`
  - `auth.oauth.start.failed`
  - `auth.oauth.callback`
  - `auth.oauth.callback.failed`
  - `auth.oauth.link`
  - `auth.oauth.link.failed`
  - `auth.oauth.session`
  - `auth.oauth.session.failed`

`stub/test mode`

- deterministic stub-provider success and failure flows
- current shipped tests cover:
  - first-time stub login that auto-creates a linked internal identity
  - stub callback failure without link creation
  - signed-in account linking followed by later login through the existing OAuth link

`dependencies`

- `runtime.config`
- existing identity and session model

Completion criteria:

- start flow, callback, identity link or create, and session establishment exist
- tests cover stub-provider success or failure and account linking
- the current shipped slice meets these criteria

### http.outbound

Slice status:

- identity and external integrations
- shipped runtime slice
- not in active first slice

`publicApi`

- send signed or configured outbound request
- retry request
- return normalized response metadata
- current shipped host surface:
  - `POST /api/http/outbound`
  - `GET /api/http/outbound`
  - `GET /api/http/outbound/:id`

`config`

- endpoint config
- auth config
- retry policy
- timeout policy
- current shipped runtime config defaults:
  - `http.outbound.timeoutMs`
  - `http.outbound.maxAttempts`
  - `http.outbound.retryDelayMs`

`internals`

- request signer
- retry loop
- correlation-id propagation
- current shipped transport split:
  - `stub://` adapter path for deterministic local tests
  - `http:` and `https:` fetch path for real runtime calls

`authority`

- network.fetch
- secret access

`placement`

- `context`
- `serverRunner`

`provider adapters`

- generic local test adapter first
- provider-bound integrations later
- current shipped stub adapters:
  - `stub://echo`
  - `stub://status/<code>`
  - `stub://flaky/...`
  - `stub://timeout/<ms>`

`witness contract`

- target endpoint or integration
- request attempt
- retry attempt
- success or failure
- response or correlation id when present
- current shipped witness processes:
  - `http.outbound.request`
  - `http.outbound.attempt`
  - `http.outbound.retry`
  - `http.outbound.succeeded`
  - `http.outbound.failed`
  - `http.outbound.request.failed`

`stub/test mode`

- deterministic local adapter
- forced timeout and retry cases
- shipped tests cover:
  - config-backed bearer signing through the stub path
  - retry then success on a flaky stub target
  - timeout then terminal failure with diagnostics
  - request rejection when auth config is missing

`dependencies`

- `runtime.config`
- side-effect witness contract

Completion criteria:

- signed request execution, retry, and result witnessing exist
- tests cover timeout, failure, and retry behavior

### webhook.inbound

Slice status:

- identity and external integrations
- shipped runtime slice
- not in active first slice

`publicApi`

- receive inbound webhook
- verify signature
- reject replay
- hand accepted event into jobs or process boundary
- current shipped host surface:
  - `POST /api/webhooks/inbound/:target`
  - `GET /api/webhooks`
  - `GET /api/webhooks/:id`

`config`

- secret binding
- signature policy
- replay window policy
- current shipped config keys:
  - `webhook.inbound.secret`
  - `webhook.inbound.replayWindowMs`
  - `webhook.inbound.maxAttempts`
  - `webhook.inbound.retryDelayMs`

`internals`

- verifier
- replay store
- handoff bridge to jobs or process boundary
- current shipped bridge persists payload bytes under local runtime storage, creates a first-class `webhookDelivery` thing, and hands accepted deliveries into `jobs.queue`

`authority`

- network.listen through the existing host seam
- secret access
- serverRunner mutation authority for operator inspection through the generic host

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
- current shipped witnesses:
  - `webhook.inbound.receive`
  - `webhook.inbound.receive.failed`
  - `webhook.inbound.verify.failed`
  - `webhook.inbound.replay.failed`
  - `webhook.inbound.accepted`
  - `webhook.inbound.accept.failed`
  - `webhook.inbound.processed`
  - `webhook.inbound.process.failed`

`stub/test mode`

- deterministic signature and replay fixtures
- shipped host tests cover valid signed delivery, invalid signature rejection, duplicate replay rejection, missing-secret failure, and operator diagnostics

`dependencies`

- `runtime.config`
- `jobs.queue`
- side-effect witness contract

Completion criteria:

- signature verification, replay protection, and job or process handoff exist
- tests cover invalid signatures and duplicate delivery
- the current shipped slice exposes inspection and diagnostics through `/api/webhooks`, `/api/webhooks/:id`, and `/api/backend-seams`

### notify.email

Slice status:

- identity and external integrations
- shipped runtime slice
- not in active first slice

`publicApi`

- enqueue email
- preview rendered email in local mode
- attempt delivery
- current shipped host surface:
  - `POST /api/notify/email`
  - `GET /api/notifications`
  - `GET /api/notifications/:id`

`config`

- provider credentials
- sender defaults
- template binding
- current shipped stub transport uses a local default sender and does not require external provider credentials

`internals`

- outbox
- renderer
- delivery adapter
- retry integration
- current shipped outbox is projected from `notify.email.*` witnesses plus linked `jobs.queue` state

`authority`

- secret access
- provider network access
- serverRunner mutation authority for enqueue and inspection through the generic host

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local stub transport first
- real provider later
- the local stub transport is the shipped provider path

`witness contract`

- outbox enqueue
- render attempt
- send attempt
- success or failure
- provider message id when present
- current shipped processes:
  - `notify.email.enqueue`
  - `notify.email.enqueue.failed`
  - `notify.email.render`
  - `notify.email.render.failed`
  - `notify.email.send`
- queue-linked retry and final failure state remain visible through `jobs.queue.retry` and `jobs.queue.deadLetter`

`stub/test mode`

- local preview and stub delivery path
- current shipped tests cover successful preview plus render failure with retry and dead-letter

`dependencies`

- `jobs.queue`
- `runtime.config`

Completion criteria:

- outbox enqueue, stub preview, delivery attempt, and failure state exist
- tests cover template or render failure and retry
- current shipped slice meets these criteria

### notify.sms

Slice status:

- identity and external integrations
- shipped runtime slice
- not in active first slice

`publicApi`

- enqueue SMS
- preview rendered SMS in local mode
- attempt delivery
- current shipped host surface:
  - `POST /api/notify/sms`
  - `GET /api/notifications`
  - `GET /api/notifications/:id`

`config`

- provider credentials
- sender defaults
- template binding
- current shipped stub transport uses a local default sender and does not require external provider credentials

`internals`

- outbox
- renderer
- delivery adapter
- retry integration
- current shipped outbox is projected from `notify.sms.*` witnesses plus linked `jobs.queue` state

`authority`

- secret access
- provider network access
- serverRunner mutation authority for enqueue and inspection through the generic host

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local stub transport first
- real provider later
- the local stub transport is the shipped provider path

`witness contract`

- outbox enqueue
- render attempt
- send attempt
- success or failure
- provider message id when present
- current shipped processes:
  - `notify.sms.enqueue`
  - `notify.sms.enqueue.failed`
  - `notify.sms.render`
  - `notify.sms.render.failed`
  - `notify.sms.send`
- queue-linked retry and final failure state remain visible through `jobs.queue.retry` and `jobs.queue.deadLetter`

`stub/test mode`

- local preview and stub delivery path
- current shipped tests cover successful stub delivery, and the render/retry path shares the same queue and renderer machinery as email

`dependencies`

- `jobs.queue`
- `runtime.config`

Completion criteria:

- outbox enqueue, stub preview, delivery attempt, and failure state exist
- tests cover template or render failure and retry
- current shipped slice meets these criteria

### search.index

Slice status:

- data and async substrate
- shipped runtime slice
- not in active first slice

`publicApi`

- build index
- reindex
- reindex one stale indexed asset through the shared index
- query index
- inspect current index
- current shipped host surface:
  - `GET /api/search/index`
  - `POST /api/search/index/build`
  - `POST /api/search/index/reindex`
  - `POST /api/search/index/query`
  - `POST /api/assets/:id/search/reindex`

`config`

- source bindings
- tokenizer or local index policy
- reindex policy
- current shipped runtime config keys:
  - `search.index.provider`
  - `search.index.maxTextBytes`
  - `search.index.defaultLimit`
  - `search.index.assetRefreshPolicy`
- current shipped storage binding:
  - `serverRunner.storage.searchRoot`

`internals`

- index store
- reindex worker
- query bridge
- current shipped runtime persists a local JSON-backed index state, stores source descriptors for later reindex, prefers derived asset text when ingestion has produced it, and scores simple token matches locally
- queued asset ingestion can refresh existing asset-backed index sources after derived text changes
- the current shipped local ingestion path uses structured extractors for `json`, `csv`, `tsv`, first-slice PDF text, and markup-style text assets instead of only raw UTF-8 truncation
- asset-backed refresh now obeys explicit `search.index.assetRefreshPolicy` values:
  - `on-ingest`
  - `manual`

`authority`

- filesystem.write when local index files exist
- filesystem.read when local index files exist
- serverRunner mutation authority for the current generic host endpoints

`placement`

- `context`
- `serverRunner`

`provider adapters`

- local text index first
- the current shipped provider path is `local-text`

`witness contract`

- index build attempt
- reindex attempt
- success or failure
- query result metadata when useful
- current shipped witness processes:
  - `search.index.build`
  - `search.index.build.failed`
  - `search.index.reindex`
  - `search.index.reindex.failed`
  - `asset.search.reindex`
  - `asset.search.reindex.failed`
  - `search.index.query`
  - `search.index.query.failed`

`stub/test mode`

- deterministic local index fixtures
- current shipped tests cover:
  - explicit-document query correctness
  - structured extraction for `json` assets
  - asset-backed stale-index rebuild after derived ingestion output changes
  - queued asset-ingestion reindex after stored asset bytes change
  - manual refresh policy that leaves indexed results stale until an explicit reindex
  - query failure when no index has been built yet

`dependencies`

- `db.sql` or another explicit record or asset source
- often `jobs.queue` for reindex work
- the current shipped slice now supports queued background refresh for asset-backed sources through `asset.ingest.process`

Completion criteria:

- index build, reindex, and query path exist
- tests cover stale-index rebuild and query correctness
- the current shipped slice meets these criteria

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

Current honest status:

- shipped backend capability definitions now project explicit `dependsOn`, `authority`, `providerAdapters`, and `witnessContract` metadata through the normal capability model
- `GET /api/backend-seams` now exposes the installed backend capability contracts for the active host rather than leaving those seam-wide rules only in prose
- `runtime.config` is shipped runtime behavior with runner-authored config, env-backed secret resolution, safe inspection, and startup failure on unresolved required secrets
- `jobs.queue` is shipped runtime behavior with a witnessed in-process worker, delayed execution, idempotent enqueue, retry/backoff, dead-letter state, generic host endpoints, and host tests
- `db.sql` is shipped runtime behavior with generic host endpoints, a local SQLite provider path, witnessed datasource and operation boundaries, explicit unsupported Postgres/MySQL adapter boundaries, diagnostics, and host tests
- `search.index` is shipped runtime behavior with generic host build, reindex, inspect, and query endpoints, a local-text provider path, asset-backed source support, diagnostics, and host tests
- `search.index` now also exposes explicit `search.index.assetRefreshPolicy` behavior and structured local asset-text extraction through the queue-backed ingestion path
- `search.index` now also exposes asset-scoped repair for stale indexed assets through `POST /api/assets/:id/search/reindex`, with host tests and explicit witness events
- `auth.oauth` is shipped runtime behavior with a stub provider path, host start and callback endpoints, first-class OAuth link witnessing, session establishment through the existing identity model, diagnostics, and host tests
- `notify.email` is shipped runtime behavior with a stub outbox, rendered preview, queue-backed delivery, retry/dead-letter integration, generic host endpoints, and host tests
- `notify.sms` is shipped runtime behavior with a stub outbox, preview text, queue-backed delivery, generic host endpoints, and host tests
- `http.outbound` is shipped runtime behavior with generic host endpoints, a deterministic local stub adapter, config-backed signing, retry and timeout witnessing, inspection endpoints, and host tests
- `fs.blob` is shipped runtime behavior with host tests for scope enforcement, path restrictions, stable refs, folder listing, read, write, and delete
- `fs.stream` is shipped runtime behavior with host tests for large streamed write/read/copy flows and deterministic teardown on failure
- `fs.stream` witnesses now expose chunk-count, max-chunk, drain-count, and write-high-water-mark metrics, and `/api/backend-seams` projects the corresponding stream diagnostics
- `upload.asset` plus explicit private hosting and runner-gated public hosting are shipped runtime behavior with host and browser tests
- `upload.asset` now accepts both raw and multipart upload paths, witnesses upload kind plus declared-size and stream metrics for operator inspection, and exposes first-class asset attach/detach behavior through the generic host
- `upload.asset` queued ingestion now also derives structured text, first-slice PDF text, intrinsic image metadata, and local SVG-backed thumbnail artifacts for supported image uploads, with private thumbnail hosting through the generic host
- `upload.asset` now also exposes operator retry for failed or dead-letter asset ingestion through `POST /api/assets/:id/ingest/retry`, with host tests and backend-seams inspection visibility
- `upload.asset` now also exposes asset-local repair affordances in the canvas inspector, including witnessed processing/search summaries plus direct retry and search-refresh actions when the projected asset state is retryable
- the current browser coverage includes drop-disabled state, single-file drop, multi-file drop with placement offsets, contextless fallback into `homeContext -> Files`, and canvas-inspector attachment of an uploaded asset onto another world thing
- the shipped upload slice now has an operator-visible inspection surface for storage status, attachment counts, and recent upload/attach/content-read/thumbnail-read failures
- upload validation policy is intentionally narrow in the first slice: any file type is accepted and no MIME or size allowlist is enforced yet
- richer stream transforms, hosted-provider large-payload verification, and stronger backpressure behavior against non-local providers remain open work

### Immediate Asset Follow-On

The logically next execution wave after drag-and-drop uploads is deeper asset understanding, not a second unrelated upload entry point.

That means section 6 should prioritize:

- broader queued ingestion behind `jobs.queue`, including richer document and binary extractors plus stronger rendition pipelines
- richer product-visible derived structure, so search, inspection, and attachment surfaces can use more than filename plus raw bytes
- deeper asset product surfaces after the now-shipped repair affordances, so dropped files feel like live world objects through stronger previews, derived representations, and clearer context or attachment-aware inspection

This is still the same `upload.asset` seam working together with `jobs.queue` and `search.index`.

It is not a separate product concept.

---

## Product Honesty and Operability Rules

Section 6 must stay truthful in these ways:

- external systems remain proxy-shaped rather than hidden truth stores
- backend seams stay stub-first where vendor lock-in would otherwise block product work
- capability config and provider status must become operator-visible once runtime slices exist
- failed side effects must be inspectable
- bootstrap or inspection surfaces for practical backend capabilities should arrive after the first runtime slice is real

Current shipped subset:

- the installed backend capability catalog now exposes explicit provider-adapter, authority, dependency, and witness-contract metadata through `GET /api/backend-seams`
- shipped backend capability contracts keep local or stub adapters first where vendor dependency would otherwise block product work:
  - `fs.blob`, `fs.stream`, and `upload.asset` default to local disk
  - `db.sql` defaults to SQLite
  - `jobs.queue` defaults to the in-process worker
  - `search.index` defaults to the local text index
  - `auth.oauth`, `notify.email`, and `notify.sms` default to stub providers
  - `http.outbound` exposes both shipped native-fetch and deterministic stub transports
- shipped external integration seams stay proxy-shaped with witnessed external reference ids on first-class world objects:
  - `auth.oauth` links project `providerAccountId`
  - `http.outbound` requests project `externalRefId` and `correlationId`
  - `webhook.inbound` deliveries project `deliveryId` and `correlationId`
  - `notify.email` and `notify.sms` notifications project `providerMessageId`
- `GET /api/backend-seams` exposes operator-visible diagnostics for:
  - capability install status
  - runtime-config field and missing-secret counts
  - provider lists and status summaries for `db.sql`, `search.index`, `auth.oauth`, `http.outbound`, `webhook.inbound`, `notify.email`, `notify.sms`, and `upload.asset`
  - recent failed side effects across uploads, content reads, jobs, outbound calls, SQL operations, search operations, OAuth flows, webhook processing, notifications, blob operations, and stream operations
- `GET /backend-seams` provides the corresponding inspection surface on the generic host
- the current asset seam inspection still goes deepest because it was the first active slice, but cross-capability diagnostics and inspection are now shipped runtime behavior

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
