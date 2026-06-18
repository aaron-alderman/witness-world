# ContextHub Spec

This document defines `ContextHub` as the product surface and runtime architecture for near-context knowledge, intent alignment, and LLM co-development.

It is not a separate wiki product.

It is the contextual knowledge layer over the same platform model that already owns:

- intents
- docs
- roadmap tasks
- features and epics
- verification gates and reports
- branches, proposals, and change sets
- runtime surfaces and capabilities

The main goal is to make human and LLM collaboration cheaper, safer, and less lossy.

Primary sources:

- [docs/INTENT-REGISTRY-ROADMAP.md](C:\Users\aaron\Documents\world\docs\INTENT-REGISTRY-ROADMAP.md)
- [docs/PLATFORM-ALL-THE-WAY-ROADMAP.md](C:\Users\aaron\Documents\world\docs\PLATFORM-ALL-THE-WAY-ROADMAP.md)
- [docs/CONTINUOUS-VERIFICATION-ROADMAP.md](C:\Users\aaron\Documents\world\docs\CONTINUOUS-VERIFICATION-ROADMAP.md)
- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)
- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md)

## 1. Product Thesis

`ContextHub` is the place where the system answers:

- what is this thing
- why does it exist
- who is it for
- what nearby code, docs, tests, and reports matter
- what changed recently
- what is stale, missing, risky, or disputed
- what should an LLM or human read before making a change

The problem it solves is not only "find documentation."

The actual problem is context loss:

- a branch knows code changes but not intent
- docs know intent but not proof
- tests know proof but not product purpose
- LLMs can read everything but still miss the nearest relevant things
- humans can navigate locally but still lose cross-file and cross-surface coherence

`ContextHub` should reduce that loss by making context first-class, inspectable, and cheap to repair.

## 2. Product Positioning

`ContextHub` is:

- a contextual index
- a knowledge surface
- a retrieval and packaging system
- a freshness and alignment monitor
- an LLM handoff layer

`ContextHub` is not:

- a freeform note silo
- a second source of truth for code
- a replacement for docs, tests, or roadmap artifacts
- a generic vector-database product with weak provenance
- a separate assistant-only private memory layer

The system of record remains the witnessed platform model plus governed repo/world artifacts.

## 3. Core Product Outcomes

### 3.1 For humans

- faster understanding of a subsystem without broad repo spelunking
- one place to see linked intent, docs, tests, reports, branches, and risks
- clearer "what changed and why" summaries
- visible stale or missing knowledge rather than silent drift

### 3.2 For LLMs

- smaller, higher-signal context packs
- less prompt waste on irrelevant files
- better explanation of authority, scope, and nearby invariants
- easier mapping from requested change to affected docs/tests/surfaces
- stronger branch-level and intent-level continuity across turns and sessions

### 3.3 For teams

- fewer hidden private mental models
- better consistency between product docs, developer docs, system docs, and test evidence
- cheaper onboarding
- more honest automation and bot assistance

## 4. LLM Co-Development Focus

This is the main differentiator.

`ContextHub` should make LLM co-development easier in six concrete ways.

### 4.1 Better retrieval than repo-wide search

Instead of "search the whole repo for maybe-relevant strings," the system should retrieve:

- the active intent row
- the closest governed docs
- the nearest features and roadmap tasks
- the relevant verification gates and most recent reports
- the active branch or change-set evidence
- the nearby runtime surfaces, handlers, routes, and capabilities
- the important known gaps and defects

This gives the LLM a prepared context neighborhood rather than a blank search problem.

### 4.2 Stable context identity across file movement

LLMs lose continuity when paths or code layout change.

`ContextHub` should prefer stable ids:

- `intent:*`
- `doc:*`
- `feature:*`
- `epic:*`
- `gate:*`
- `testRun:*`
- `report:*`
- `surface:*`
- `route:*`
- `capability:*`

That lets agents refer to meaning, not just paths.

### 4.3 Context packs for specific tasks

The runtime should be able to build a `contextPack` for a given task such as:

- implement feature
- investigate regression
- update stale docs
- add or repair verification
- review a change set
- explain a subsystem

Each pack should contain:

- the triggering object
- nearby objects by dependency and intent linkage
- a compact fact sheet
- selected source excerpts or references
- active risks, stale docs, missing tests, or failing reports

This is a better primitive for LLM work than raw long prompts.

### 4.4 Explicit uncertainty and drift

The LLM should see:

- which links are authored
- which are inferred
- which are stale
- which are disputed
- which are bot-suggested only

That prevents false confidence from derived or outdated context.

### 4.5 Better agent handoff

When one agent or user hands work to another, the hub should provide:

- the intent summary
- the active branch/change-set state
- the required docs
- the relevant verification gates and latest results
- the missing alignment obligations
- the proposed next actions

That makes cross-agent continuity cheaper and less lossy.

### 4.6 Reviewable generated artifacts

LLMs should be able to generate:

- doc updates
- design rationale summaries
- report summaries
- missing-facet templates
- branch-level change narratives

But these must land as reviewable artifacts with provenance, not ambient truth.

## 5. Target Users

### 5.1 Product steward

Needs:

- what this feature is for
- status, risks, missing acceptance proof
- actor-facing docs and product rationale

### 5.2 Developer

Needs:

- nearby code/runtime surfaces
- linked tests and failures
- implementation notes
- branch/change-set continuity

### 5.3 System/operator/admin

Needs:

- runtime topology
- operational docs
- failure patterns
- verification health
- authority and recovery surfaces

### 5.4 LLM agent

Needs:

- compact task-specific context
- stable ids
- linkage between code, docs, tests, and intent
- freshness and trust metadata

## 6. Information Model

`ContextHub` should be a projection over first-class platform objects plus some new contextual objects.

### 6.1 Existing objects it should consume

- `intent`
- `intentRegistryEntry`
- `docNode`
- `docSection`
- `docTask`
- `roadmapTask`
- `epic`
- `feature`
- `proposal`
- `branch`
- `changeSet`
- `candidateSnapshot`
- `testGate`
- `testRun`
- `testReport`
- `artifact`
- `defect`
- `gap`
- `surface`
- `route`
- `handler`
- `capability`
- `boundary`

### 6.2 New objects it should add

- `contextHub`
  - a surface or projection scope
- `contextPack`
  - a bounded task-specific package of linked facts and artifacts
- `contextLink`
  - explicit typed relationships between contextual objects
- `alignmentDebt`
  - visible unresolved drift
- `knowledgeFacet`
  - actor or role-oriented knowledge slice
- `provenanceNote`
  - authored, inferred, bot-suggested, or imported source classification

### 6.3 Key typed links

- `explains`
- `proves`
- `implements`
- `governs`
- `affects`
- `ownedBy`
- `usedBy`
- `staleBecause`
- `derivedFrom`
- `recommendedFor`
- `nearbyTo`

## 7. Facet Model

Each object in the hub can participate in multiple facets:

- product
- developer
- system
- admin
- operator
- actor-facing
- roadmap
- test-report
- rationale

The important rule is:

facets are views over shared objects, not separate object trees.

## 8. Product Surface Design

`ContextHub` should be exposed through `/platform`, not as a parallel app.

### 8.1 Main navigation

The first useful top-level placement is inside the existing `knowledge` and `verification` areas, then later as a dedicated `ContextHub` page if it grows beyond those boundaries.

Recommended sequence:

- phase 1: enrich `/platform?view=knowledge`
- phase 2: enrich `/platform?view=verification`
- phase 3: add `/platform?view=context` when the projections are mature enough

### 8.2 Primary views

#### A. Intent list

Shows:

- title
- context
- actors
- owner
- status
- freshness
- missing facets
- linked branch/feature/test counts

#### B. Intent detail

Shows:

- summary
- actor/facet classification
- linked docs
- linked sections
- linked tasks
- linked features and epics
- linked tests and reports
- linked branches/proposals/change sets
- stale or missing evidence
- recommended next actions

#### C. Context pack preview

Shows:

- what the pack is for
- what objects it includes
- why each object is included
- total context budget estimate
- freshness and trust warnings

#### D. Alignment debt view

Shows:

- stale docs
- missing test proof
- missing actor-facing facet
- missing developer/system/admin explanations
- bot suggestions awaiting review

#### E. Verification-linked knowledge

Shows:

- which intents/features a report proves
- which docs are now stale because a test failed
- which regressions invalidate previous summaries

## 9. Key User Flows

### 9.1 "I want to change a feature"

1. Open feature or intent.
2. See the linked branch/change sets and relevant docs.
3. Open a generated `contextPack`.
4. Hand that pack to an LLM or continue manually.
5. After edits, inspect alignment debt and verification obligations.

### 9.2 "A regression happened"

1. Open failing test report or regression signal.
2. Jump to linked features, docs, and recent change sets.
3. See what intent or actor surface is affected.
4. Ask the LLM to investigate using the regression context pack.

### 9.3 "This area has no docs"

1. Open a feature or intent.
2. See missing facets.
3. Generate a scaffold template.
4. Review and commit as a governed doc or patch.

### 9.4 "Hand work to another agent"

1. Generate handoff context pack.
2. Include active branch/change-set, nearby docs, failing reports, and open alignment debt.
3. Next agent continues without broad rediscovery.

## 10. Architecture

`ContextHub` should have six layers.

### 10.1 Source layer

Inputs:

- governed Markdown docs
- roadmap docs
- JSDoc
- RVMDoc
- WTOML and runtime config metadata
- platform model objects
- test reports and verification artifacts
- branch/proposal/change-set evidence

Important rule:

JSDoc and RVMDoc are reference feeders into the hub, not the final contextual product by themselves.

### 10.2 Ingestion layer

Responsibilities:

- parse docs into sections and tasks
- parse JSDoc into symbol/reference records
- parse RVMDoc into surface/query/command/reference records
- map references to stable concept ids
- classify source provenance
- extract actor/facet hints

### 10.3 Linking layer

Responsibilities:

- resolve references to platform objects
- infer nearby relationships from dependency graph, ownership, and branch evidence
- record authored versus inferred links
- maintain reverse links

### 10.4 Projection layer

Responsibilities:

- build intent-centric read models
- build context packs
- build alignment debt summaries
- build facet-specific views
- compute freshness and trust state

### 10.5 Serving layer

Responsibilities:

- `/platform` views
- MCP read tools
- LLM context-pack endpoints
- report and doc generation helpers

### 10.6 Repair layer

Responsibilities:

- bot-suggested cross-links
- missing-facet templates
- doc-update proposals
- report-summary regeneration
- stale link repair workflows

## 11. Retrieval And Context-Pack Architecture

This is the LLM-critical part.

### 11.1 Pack types

- `implement`
- `debug`
- `review`
- `document`
- `explain`
- `handoff`
- `verify`

### 11.2 Pack construction

Each pack should include:

- root object
- immediate authored links
- dependency-nearby objects
- recent change evidence
- verification status
- stale and missing context warnings
- selected source references
- compact summary card

### 11.3 Ranking rules

Prefer:

- authored links over inferred links
- fresher objects over stale ones
- objects on the active branch over distant history
- exact intent/feature matches over lexical matches
- proven verification links over generic docs

Demote:

- stale docs with no recent confirmation
- unrelated lexical hits
- bot-only suggestions with no review

### 11.4 Token-budget behavior

For LLM use, packs should be able to emit:

- `tiny`
- `small`
- `medium`
- `full`

And degrade gracefully:

- keep ids, summaries, and risks first
- then keep linked docs/tests/features
- then keep excerpts
- then keep long-tail related objects last

## 12. Freshness, Trust, And Drift

Every hub object should carry:

- freshness state
- provenance state
- confidence
- last-validated time
- stale reasons

Suggested freshness states:

- fresh
- stale
- missing
- unknown
- disputed

Suggested provenance states:

- authored
- inferred
- bot-suggested
- imported
- generated

## 13. JSDoc And RVMDoc Role

`JSDoc` and `RVMDoc` are useful only when they feed `ContextHub` cleanly.

### 13.1 JSDoc role

Good for:

- symbol-level contracts
- handler and function semantics
- parameter and return expectations
- local invariants

Bad as a full product knowledge system because:

- it is too symbol-local
- it lacks intent and actor context
- it drifts from product docs easily

### 13.2 RVMDoc role

Good for:

- authored surface meaning
- query/command/view contracts
- report definitions
- visible UI/runtime semantics

Bad as a full product knowledge system because:

- it still needs linkage to intent, proof, and actor facets

### 13.3 ContextHub rule

- JSDoc and RVMDoc should emit linked reference records.
- ContextHub should bind those records back to intents, features, tests, reports, and docs.
- Generated reference pages should be navigable from ContextHub, not floating separately.

## 14. API And Runtime Shape

Suggested read surfaces:

- `GET /api/context-hub/intents`
- `GET /api/context-hub/intents/:id`
- `GET /api/context-hub/packs/:id`
- `POST /api/context-hub/packs`
- `GET /api/context-hub/alignment-debt`
- `GET /api/context-hub/facets/:facet`

Suggested platform-model slices:

- `view=intents`
- `view=contextPacks`
- `view=alignmentDebt`
- `view=knowledgeFacets`

Suggested MCP lanes:

- `platform.context.read`
- `platform.context.pack`
- `platform.context.align`

Important rule:

these should sit on the same handler lane and platform authority story as the rest of `/platform`.

## 15. Security And Authority

`ContextHub` must respect the same authority model as the rest of the system.

That means:

- actor-scoped or private docs must not leak into context packs without authority
- generated packs must respect branch/change-set visibility
- admin or operator facets may be visible only to the right actors
- LLM helpers must not silently cross authority boundaries

## 16. Product Risks

### 16.1 Fake coherence

Risk:

the hub looks complete while mostly showing weak inferred links.

Mitigation:

show provenance and confidence everywhere.

### 16.2 Over-automation

Risk:

bots rewrite the knowledge graph into misleading certainty.

Mitigation:

make bot repairs reviewable and visibly derived.

### 16.3 Retrieval bloat

Risk:

context packs become giant and noisy.

Mitigation:

rank aggressively and keep pack-size modes explicit.

### 16.4 Path lock-in

Risk:

the hub depends on file paths instead of stable ids.

Mitigation:

treat paths as one signal, not the identity model.

## 17. Roadmap

### Tranche 0. Seed

Goal:

define `ContextHub` as a projection over the existing platform and intent-registry work.

Deliver:

- [ ] core vocabulary
- [ ] initial `/platform` knowledge enrichments
- [ ] stable intent-centric ids
- [ ] basic authored versus inferred provenance

### Tranche 1. Intent-Centric Knowledge

Goal:

make intent rows the main navigation unit.

Deliver:

- [ ] intent list and detail
- [ ] facet classification
- [ ] links to docs, tasks, features, tests, reports, proposals, and branches

### Tranche 2. Reference Feeders

Goal:

ingest `JSDoc` and `RVMDoc` as reference sources.

Deliver:

- [ ] JSDoc ingestion pipeline
- [ ] RVMDoc ingestion pipeline
- [ ] stable concept mapping
- [ ] linked reference records inside the hub

### Tranche 3. Context Packs

Goal:

make LLM-ready packs a first-class runtime primitive.

Deliver:

- [ ] pack kinds
- [ ] ranking rules
- [ ] size modes
- [ ] pack preview and export

### Tranche 4. Alignment Debt

Goal:

surface drift and missing nearby knowledge.

Deliver:

- [ ] stale and missing-facet gaps
- [ ] report-to-doc and test-to-feature freshness checks
- [ ] branch-level documentation obligations

### Tranche 5. Verification Integration

Goal:

bind knowledge and proof together.

Deliver:

- [ ] intent-linked reports
- [ ] failing-report impact propagation
- [ ] regression-driven stale-doc warnings

### Tranche 6. Bot Repair

Goal:

let agents repair and extend context safely.

Deliver:

- [ ] template generation
- [ ] cross-link suggestions
- [ ] handoff-pack generation
- [ ] reviewable doc-update proposals

### Tranche 7. Dedicated Surface

Goal:

graduate from enriched knowledge pages to a first-class `ContextHub` page when warranted.

Deliver:

- [ ] dedicated `/platform?view=context`
- [ ] context-specific MCP reads
- [ ] richer operator and agent controls

## 18. Success Criteria

`ContextHub` is succeeding when:

- LLM changes need fewer broad repo searches
- handoffs between users and agents lose less context
- missing docs and missing proof become visible quickly
- generated docs and reports are reviewable and linked instead of floating
- product, developer, system, and admin knowledge stop drifting into isolated silos

## 19. Practical Rule

If an LLM is about to work on a feature, bug, report, or branch without a good nearby context pack, that is a platform gap.

`ContextHub` exists to close that gap without inventing a second truth system.
