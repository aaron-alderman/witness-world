# Group C - Practical Backend

`/goal` Turn practical backend needs into witnessed capability seams with explicit provider, authority, repair, and MCP stories, while preventing providers, helpers, or ops scripts from becoming the hidden product truth.

This group is tranche 5:

- runtime config
- files and uploads
- SQL, jobs, and search
- OAuth, outbound HTTP, webhooks, notifications
- diagnostics, repair, and MCP operator seams

## Mission

Make common backend needs composable, witnessed, inspectable capability seams instead of handler-specific infrastructure.

## End-State

Group C is done when:

- each backend seam has a clear capability contract, provider boundary, witness contract, and inspection path
- local or stub-first providers exist where needed
- at least one serious hosted provider is proven for the highest-value seams
- repair, retry, and diagnostics are first-class product behavior
- MCP can operate these seams without bypassing the normal authority and witness model

## Progress

Shipped so far against this group:

- **Stage C0 (contract freeze)** — a per-seam contract-coverage guard (`test/backend-seam-contract.test.js`, canonical list `BACKEND_SEAM_CAPABILITY_IDS` in `src/runtime-builtins.js`) asserts every backend seam declares provider adapters, a witness contract with a failure phase, and authority/config arrays, and fails when a new seam ships provider/failure metadata without being declared.
- **Stage C3.1 (real email provider)** — `notify.email` now ships a generic-HTTP transport and a concrete **SendGrid** transport behind the same seam, selected by `notify.email.provider`, with the stub default still first-class.
- **Stage C3.2 (real OAuth provider)** — `auth.oauth` now ships a generic OIDC/OAuth2 adapter plus concrete **Google** and **GitHub** presets, with real code-exchange + userinfo through a host-injected fetch and the stub default still first-class.

Next per the priority order: a serious hosted SQL provider (promote `preview` Postgres/MySQL to full operations) and a hosted asset/object-storage provider.

## Non-Goals

- vendor-first architecture
- backend behavior hidden behind arbitrary helper libraries
- a second control plane that bypasses witnessed product truth

## Guardrails For New Contributors

This group looks the most like conventional backend engineering.
That makes it high risk for accidental cheating.

The main bad reflexes are:

- letting the provider become the product concept
- hiding side effects in helpers with weak witness coverage
- adding direct operator powers that bypass normal authority and inspection
- treating retries, jobs, and failures as infrastructure internals instead of product-visible behavior

### Hard Rules

- model one product seam, many providers
- every external side effect must witness intent, attempt, result, and external reference where applicable
- local or stub-first paths stay first-class even after a real provider is added
- repair and retry are part of the seam, not afterthought scripts
- MCP operations must call into the same capability behavior, not a secret admin path

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- the real state lives in provider storage and the world cannot explain it
- a provider-specific detail leaked into the public capability concept
- a failure path is only visible in logs
- a retry or repair path requires manual database or filesystem surgery
- MCP can do something operators cannot inspect through the normal runtime surfaces

## Workstreams

### C1. Foundation Contracts

Protect the seam shape:

- `runtime.config`
- provider adapter contract
- side-effect witness contract
- backend authority contract

### C2. Asset and Ingestion Depth

Continue the already-active upload and asset seam until assets behave like real world objects.

### C3. Durable Data and Async Substrate

Deepen SQL, jobs, and search so later capabilities rest on stronger primitives.

### C4. Real External Providers

Prove at least one real provider in the key integration seams.

### C5. Operability and MCP

Make diagnosis, repair, and operator automation explicit and safe.

## Ordered Execution Ladder

### Stage C0. Freeze Contract Drift

Objective:
Keep all shipped backend seams aligned to one contract shape.

Slices:

- project capability contract metadata for every shipped backend seam
- verify each seam exposes config, authority, provider, and witness information
- fail tests when a new seam lands without that metadata

Acceptance:

- backend seams are comparable as products, not only as code paths

### Stage C1. Finish the Asset Product Wave

Objective:
The next asset work should deepen understanding, not create parallel upload stories.

Slices:

#### C1.1 Context-aware asset explanation

Implementation:

- show governing context, attachment graph, storage policy, and processing status on the asset itself
- expose why an asset is public, private, attached, orphaned, stale, or blocked

Acceptance:

- asset inspection answers the normal operator questions without log-diving

#### C1.2 Richer derived structure

Implementation:

- extend extractors and derived metadata for more document classes
- expose structured facts in search and inspector surfaces
- keep derived outputs clearly non-canonical

Acceptance:

- assets reveal meaning, not just bytes and filenames

#### C1.3 More honest preview and rendition surfaces

Implementation:

- improve preview support for text, image, document, and structured assets
- expose rendition lineage and failures

Acceptance:

- an asset feels like a live object with visible derivatives

### Stage C2. Harden SQL, Jobs, and Search

Objective:
Strengthen the substrate already shipped.

Slices:

#### C2.1 Jobs as reusable operator substrate

Implementation:

- expose better job family definitions, retry classes, and repair actions
- add richer dead-letter explanations and replay controls

Acceptance:

- operators can repair queue failures without manual state surgery

#### C2.2 SQL provider proof

Implementation:

- add one real Postgres adapter before broadening relational adapters
- keep SQLite as the deterministic local path
- align migrations, transactions, diagnostics, and failure witnessing

Acceptance:

- the relational seam is proven against one serious hosted provider

#### C2.3 Search refresh and source reasoning

Implementation:

- make search source lineage clearer
- expose why a result exists, why it is stale, and how it refreshes
- improve structured extraction routing into search

Acceptance:

- search stops feeling like a side cache and feels like an inspectable projection

### Stage C3. Prove Real External Integrations

Objective:
Move the right seams from stub-only to real-provider-backed.

Priority order:

1. outbound email
2. OAuth
3. hosted asset or stream provider
4. only then additional notification or relational providers

Slices:

#### C3.1 Real email provider

Implementation:

- add one provider adapter
- keep stub delivery for local deterministic tests
- expose provider ids, retries, and errors through the same world objects

Acceptance:

- real provider delivery is honest, inspectable, and retryable

#### C3.2 Real OAuth provider

Implementation:

- add one provider path with callback, secret, and account-link handling
- keep stub OAuth for local tests

Acceptance:

- provider-backed login and linking work without special-case hiding

#### C3.3 Hosted asset or stream provider

Implementation:

- add one non-local storage path
- validate streaming, multipart, backpressure, and visibility policy

Acceptance:

- the storage seam still looks like one product contract under a hosted provider

### Stage C4. Operability and MCP

Objective:
Backend capability operations become product-grade.

Slices:

#### C4.1 Cross-seam repair surfaces

Implementation:

- normalize repair and retry actions across assets, jobs, SQL, search, notifications, webhooks, and outbound requests
- show the same action language where possible: retry, reindex, rebuild, replay, refresh

Acceptance:

- operators learn one repair grammar instead of seven unrelated ones

#### C4.2 MCP backend operations maturity

Implementation:

- ensure MCP tools map onto real repair and inspection operations
- tighten scopes so tools cannot exceed the underlying actor or install boundary
- expose tool provenance and effect explanation

Acceptance:

- MCP is a truthful operator and authoring seam over backend capabilities

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Add a per-seam metadata coverage test for config, authority, provider, and witness contract fields.
2. Expand asset inspection with context, attachment, and processing explanation.
3. Extend structured extraction and preview coverage for assets.
4. Add richer dead-letter and replay controls for jobs.
5. Implement one real Postgres adapter.
6. Implement one real email provider adapter.
7. Normalize repair actions and expose them through MCP.

### "Trivialized" implementation breakdown for the first three slices

#### Backend seam metadata coverage

- enumerate shipped seam ids
- assert each projects required metadata
- fail fast when a seam is added without contract fields

#### Asset explanation surface

- resolve governing context
- resolve attachment targets
- resolve ingest job status
- resolve search status
- render one combined asset health summary

#### Jobs repair surface

- classify terminal failures
- add replay or retry affordance by class
- capture new witness events for repair attempts
- test happy, retryable, and blocked cases

## Acceptance Gates

- each new backend slice deepens a seam instead of multiplying product concepts
- at least one real provider is proven before broad provider expansion
- inspection and repair keep pace with runtime power
- MCP remains explicit, scoped, and witness-aligned
- a contributor with standard backend habits would be blocked from turning helpers or providers into hidden truth stores

## Primary Source Map

- [docs/BACKEND-SEAMS.md](../BACKEND-SEAMS.md)
- [ROADMAP.md](../ROADMAP.md)
- [BASELINE.md](../BASELINE.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
