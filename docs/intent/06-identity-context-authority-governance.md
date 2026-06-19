# 06 - Identity, Context, Authority & Governance

## Role in Primary Intent

The world must belong to someone. Identity establishes initial ownership. Contexts bound names, meaning, visibility and authority. All mutation happens under explicit authority via stewardship, delegation, and proposals. Governance emerges from witnessed history rather than permission tables.

See [../AUTHORITY-MODEL.md](../AUTHORITY-MODEL.md), [../CAPABILITIES.md](../CAPABILITIES.md#4-identity-context-and-authority), [../EXPERIENCE.md](../EXPERIENCE.md).

## Core Desires / Intents

### 6.1 Actor is the canonical acting authority (not raw identity or headers)
**Formal definition (AUTHORITY-MODEL.md):**
- Canonical tuple: `authenticatedIdentity`, `authenticatedActor`, `effectiveIdentity`, `effectiveActor`, `authorityMode` ("direct" | "assumed" | "service"), optional `assumptionGrantId`.
- Access checks evaluate from **effective actor**.

**Enacted:**
- [../../src/runtime-authz.js](../../src/runtime-authz.js)
- Session services: [../../src/runtime-session-services.js](../../src/runtime-session-services.js)
- Request resolution normalizes through the tuple everywhere.
- Grants API surfaces: `/api/authority/grants`

### 6.2 Context as the normal unit of naming, composition, ownership, and authority boundaries
**Defined:**
- CAPABILITIES 4.2, EXPERIENCE "Context Contains Meaning".
- Contexts carry owner, stewards, parent, local bindings (`contextBinding`), exports/imports (`contextExport` / `contextImport`).
- Contextual name resolution + conflict reporting.

**Enacted:**
- [../../src/context-naming-world.js](../../src/context-naming-world.js)
- Bootstrap/DSL surfaces now reject foreign canonical refs that are not explicitly visible.
- Read models: `contextScopes`, `contextNameResolutions`, `contextNameConflicts`.
- Many authored objects carry `context` attachment.

### 6.3 Ownership, stewardship, delegation are projections over witnessed relations
Never stored as mutable fields on objects.

**Enacted:**
- Derived via projectors from genesis + ownership/delegation relations + witness history.
- Runtime ownership: [../../src/runtime-ownership.js](../../src/runtime-ownership.js)
- Package authorship world: [../../src/package-authorship-world.js](../../src/package-authorship-world.js)

### 6.4 All important mutations flow through proposals under authority
Direct writes are replaced by proposal creation + approval that then emits witnesses.

**Enacted:**
- [../../plugins/proposals/](../../plugins/proposals/) (proposal-executor, handlers, processes)
- [../../src/runtime-governance.js](../../src/runtime-governance.js)
- Many plugins register proposal targets (authoring-core, capability-authoring, program-authoring, eden versions, widget versions, etc.).
- Live approval refreshes pages through the witness stream (no forced reload hacks).

### 6.5 First identity is an ownership event
**Enacted:**
- Bootstrap identity creation/update.
- F1 `whoami` expert shortcut that reveals current actor truth and allows inline identity edit for the home actor (narrow but real).
- Home perspective / home context concepts.

## Implementation Map (Selected)

- Authority tuple & grants: [../../src/runtime-authz.js](../../src/runtime-authz.js), authority endpoints
- Context naming & resolution: [../../src/context-naming-world.js](../../src/context-naming-world.js)
- Governance & proposals: [../../plugins/proposals/*](../../plugins/proposals/), [../../src/runtime-governance.js](../../src/runtime-governance.js)
- Ownership projection: [../../src/runtime-ownership.js](../../src/runtime-ownership.js)
- Session / login: runtime-session-services, runtime-browser-app-state
- Bootstrap identity flows: plugins/bootstrap/ (builders + tutorial)

## Honesty Snapshot
- Actor model + direct proposal paths on many authoring surfaces: real.
- Broader identity lifecycle, password recovery, full principal migration: still narrow or missing.
- Context composition is partial (first-slice on covered bootstrap/DSL surfaces; many runtime behaviors not yet fully context-aware).
- Remaining app-specific mutation routes are the main unification debt.

## Cross References
- Depends on: 01 (projections, genesis), 02 (witness substrate for history), 05 (capabilities are governed objects)
- Enables safe: 04 (authoring), 07 (executing under authority), 09 (editing), 11 (platform self-governance)
- Visible in: world browser, process view, live inspector (category 07/09)

## Key Documentation
- [../AUTHORITY-MODEL.md](../AUTHORITY-MODEL.md)
- [../CAPABILITIES.md](../CAPABILITIES.md#4-identity-context-and-authority)
- [../EXPERIENCE.md](../EXPERIENCE.md) (Context laws, stewardship progression)
