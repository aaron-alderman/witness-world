# Operator Platform Spec

## 1. Scope

The platform contract consumed by the operator product.

This document defines:

- available platform capabilities
- required object shapes
- supported read/search/mutation/runtime contracts
- invariants
- failure modes

This document does not define:

- operator product behavior
- renderer behavior
- implementation notes
- future roadmap

---

## 2. Platform Capability Surface

The platform exposes these capability families to the operator:

- object read
- object search
- contextual documentation read
- sanctioned mutation through MCP
- authored route/surface hosting
- interactive runtime bootstrap
- diagnostics and inventory read
- governance outcome reporting

---

## 3. Object Read Contract

### 3.1 Readable object families

The platform exposes readable objects for:

- routes
- surfaces
- collections
- processes
- projections
- messages
- boundaries
- policies
- capabilities
- diagnostics
- inventories
- product/domain records hosted on the platform

### 3.2 Required object fields

Each readable object provides, where applicable:

- `id`
- `label`
- `kind`
- `traits` or equivalent classification
- `relations`
- `links`
- `provenance`
- `state`

### 3.3 Object invariants

- `id` is stable and machine-addressable.
- `label` is display-facing and not a binding key.
- `kind` is explicit.
- object relations are explicit rather than implied from renderer structure.

---

## 4. Search Contract

### 4.1 Search scope

The platform exposes search over operator-relevant records.

Search supports:

- global search
- scoped search
- context-local search

### 4.2 Searchable fields

Search matches, where present, against:

- id
- label/title
- kind/type
- summary/description
- source/document hints

### 4.3 Search result shape

Each search result provides:

- `id`
- `label`
- `kind`
- `summary`
- `scope`
- `links`
- optional source/document hints

### 4.4 Search invariants

- result ordering is deterministic
- result rows are stable enough for indexed follow-up actions within a single result view
- search scope is explicit in the result context

---

## 5. Contextual Documentation Contract

### 5.1 Documentation operations

The platform exposes:

- document catalog read
- document read by stable id
- document search
- related-document lookup
- context-pack retrieval

### 5.2 Document shape

Each document provides:

- `id`
- `title`
- `kind`
- `summary`
- `appliesTo`
- `links`
- freshness/version markers where relevant

### 5.3 Context-pack shape

A context pack provides:

- target object identity
- nearby related objects
- related documents
- relevant actions
- visible constraints
- visible blockers or risks

### 5.4 Documentation invariants

- documents are addressable by stable ids
- object-to-doc linkage is explicit
- context packs are derived platform data, not renderer-local assembly

---

## 6. Mutation Contract

### 6.1 Mutation lane

The sanctioned mutation lane is MCP.

### 6.2 Mutation result classes

Every sanctioned mutation returns one of:

- `success`
- `proposal`
- `blocked`

### 6.3 Mutation result shape

Each mutation result provides:

- target identity
- action identity
- outcome class
- authority outcome
- failure or block reason where applicable

### 6.4 Mutation invariants

- no sanctioned product mutation requires direct file patching
- blocked and proposal outcomes are first-class results
- renderer locality does not grant write authority

---

## 7. Serving And Runtime Contract

### 7.1 Route and surface hosting

The platform exposes:

- authored route hosting
- authored surface delivery

### 7.2 Runtime delivery

The platform exposes:

- runtime bootstrap/manifest delivery
- route/state synchronization
- same-document interactive refresh

### 7.3 Runtime invariants

- interactive authored surfaces consume platform runtime bootstrap rather than inventing host-local authority
- route ownership and surface ownership remain platform-visible

---

## 8. Diagnostics And Inventory Contract

### 8.1 Diagnostics

The platform exposes machine-readable diagnostics for:

- active mode/profile
- enabled capabilities
- governance mode
- runtime state
- invalid/stale/blocked conditions

### 8.2 Inventories

The platform exposes inventories for:

- operator/runtime artifacts
- installed or exposed capabilities
- other platform-managed runtime records relevant to operator inspection

### 8.3 Diagnostics invariants

- blocked, stale, and invalid states are explicit
- diagnostics are consumable without source inspection

---

## 9. Canonical Baseline

The current platform baseline includes:

- MCP-governed mutation
- `world.read`
- `page.surface`
- runtime manifest/bootstrap delivery
- bootstrap model/state/diagnostic HTTP surfaces
- generic search infrastructure
- proposal-aware governance

These capabilities are part of the current platform contract consumed by the operator.

---

## 10. Failure Modes

Platform-facing failure classes:

- unsupported
- blocked
- invalid
- stale
- missing authority

Failure results must be explicit and machine-readable.

The platform does not rely on:

- silent fallback mutation
- renderer-local repair semantics
- source-path knowledge as part of the contract

---

## 11. Consumer Rules

Consumers of the platform contract bind to:

- stable object ids
- explicit kinds
- explicit relations
- explicit mutation outcomes
- explicit diagnostics

Consumers do not bind to:

- display labels as identity
- repository file layout
- renderer structure
- implementation-specific hidden seams
