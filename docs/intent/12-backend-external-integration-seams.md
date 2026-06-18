# 12 - Backend & External Integration Seams

## Role in Primary Intent

External systems (HTTP, auth providers, storage, databases, jobs, notifications, webhooks, MCP) must be modeled as explicit boundary capabilities and operations rather than invisible host powers or ad-hoc glue. The goal is to prevent hidden host privileges from becoming the real product contract.

See [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md), [../CAPABILITIES.md](../CAPABILITIES.md# practical backend providers are stub-first), and category 05 (capabilities model).

## Core Desires / Intents

### 12.1 External concerns exposed exclusively as explicit boundary capabilities
**Defined:**
- [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md): "It is intentionally product-facing." "The goal is to prevent hidden host powers from becoming the real product contract."
- Kernel `boundary` + `capability` + operations with input/output messages.
- Locked public capability interfaces and provider strategy.

**Enacted:**
- Boundaries and capabilities declared in desire / wtoml and realized by plugins.
- Example: `HostedCommand` boundary in new-desire lowering examples.

### 12.2 Stub-first where full vendor realism is intentionally deferred
**Honesty rule:**
- Shipped seams (OAuth, outbound HTTP, email, SMS, some fs/sql) are stub or simplified deterministic paths first.
- Never let them become "good enough" without an explicit migration story.

**Current providers (selected):**
- [../../plugins/http-outbound/](../../plugins/http-outbound/) — handler-catalog, handlers, io-services, projections
- [../../plugins/oauth/](../../plugins/oauth/) — providers, handlers, projections
- [../../plugins/notifications/](../../plugins/notifications/)
- [../../plugins/fs-blob/](../../plugins/fs-blob/), fs-json, fs-stream
- [../../plugins/sql/](../../plugins/sql/), sqlite (glue + provider)
- [../../plugins/jobs/](../../plugins/jobs/) + webhooks
- [../../plugins/mcp/](../../plugins/mcp/) and mcp-authoring

### 12.3 Capability dependency graph and locked interfaces
The seams document maintains a capability dependency graph, per-capability completion criteria, and explicit non-goals.

**Enacted via:**
- Capability authoring + proposal targets (category 05 + 06)
- Handler catalogs that declare what each plugin actually provides
- Runtime support services registered per plugin

### 12.4 MCP as an explicit automation seam, not a hidden privileged path
MCP tools and servers are modeled; authoring of MCP surfaces goes through the constrained plugin.authoring + proposal lane.

## Implementation Highlights

| Provider Area     | Main Plugins / Code                                      | Notes |
|-------------------|----------------------------------------------------------|-------|
| HTTP outbound     | plugins/http-outbound/*                                 | io-services, projections |
| OAuth / identity  | plugins/oauth/*                                         | multiple providers |
| Notifications     | plugins/notifications/* (email transports, jobs)        | |
| FS / blobs        | plugins/fs-*/ (blob, json, stream)                      | |
| SQL / SQLite      | plugins/sql/* , plugins/sqlite/*                        | desire-rvm lowering in some |
| Jobs / scheduled  | plugins/jobs/*                                          | provider-runtime, job-handlers |
| Webhooks          | plugins/webhooks/*                                      | |
| MCP               | plugins/mcp/* , plugins/mcp-authoring/*                 | tools + desire runtime |
| Backend seams doc | docs/BACKEND-SEAMS.md                                   | contract + criteria |

Many of these also register in the desire runtime declaration or handler catalog system.

## Practical Rules from the Seams Doc
- Upload validation policy intentionally narrow in first slice.
- No hidden foreign-scoped canonical bypasses on covered surfaces.
- Capability specs and locked interfaces are the public contract.
- Test strategy must cover the seams.

## Honesty / Status
- Most practical backend providers are present as real seams but intentionally stub or narrow in realism.
- The "fake at the core capability/composition layer: none" claim is maintained by keeping these seams visible and capability-modeled.
- Risk to watch: accidental normalization of placeholder or stub behavior as the permanent shape.

## Cross References
- Realized through: 05 (capability/plugin model), 03 (boundary + capability nouns in DESIRE), 06 (governed installation)
- Inspected via: 07 (world browser, process views of backend calls)
- Used by: 04 (composition), 08 (Sourcery can surface missing powers), 10 (shells may add transport adapters but not new semantics)
- Primary contract: [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md) + [../CAPABILITIES.md](../CAPABILITIES.md) (backend provider notes)

## Key Documentation & Code
- [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md) (full contract, per-capability criteria, dependency graph)
- [../CAPABILITIES.md](../CAPABILITIES.md) sections on practical backend + honesty ledger
- Plugin directories listed above under plugins/
- Desire boundary example in [../experiment/new-desire/LOWERING-EXAMPLES.md](../experiment/new-desire/LOWERING-EXAMPLES.md)
