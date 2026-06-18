# Continuous Verification Roadmap

This document turns always-on verification into a first-class runtime roadmap rather than an external CI note.

The goal is not "better test scripts."

The goal is:

- tests as part of the system
- one runtime story across local dev, CI, and prod
- authored verification policy instead of ad hoc framework convention
- explicit isolation for dangerous work
- honest visibility for failures, regressions, and stale validation

This is a planning document.
It complements the source specs rather than replacing them.

Primary sources:

- [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md)
- [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)
- [docs/SHELLS-PERSISTENCE-ECOSYSTEM.md](C:\Users\aaron\Documents\world\docs\SHELLS-PERSISTENCE-ECOSYSTEM.md)
- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md)
- [docs/AUTHORITY-MODEL.md](C:\Users\aaron\Documents\world\docs\AUTHORITY-MODEL.md)
- [docs/PLATFORM-ALL-THE-WAY-ROADMAP.md](C:\Users\aaron\Documents\world\docs\PLATFORM-ALL-THE-WAY-ROADMAP.md)

## Status Key

- [X] Complete.
- [~] Partially implemented or in progress.
- [B] Blocked on another tranche or prerequisite.
- [ ] Not started.

## Core Thesis

Verification should become part of the runtime contract.

That means:

- the runtime can know what should be verified
- the runtime can decide how safely it must be verified
- the runtime can cache and invalidate verification evidence honestly
- the runtime can surface failures and regressions in the product itself
- the same model can run locally, in CI, and in production with different authority and risk posture rather than different machinery

The platform should not hide verification truth in a separate control plane.

The repo or world state should remain the authored control plane for program state.
Derived verification artifacts may live in local disk, SQLite, object storage, Redis, or other explicit backends, but those are provider-bound caches and evidence stores, not hidden canonical truth.

## Non-Negotiable Invariants

- [ ] No separate fake CI product with a different model of truth.
- [ ] Verification policy must be authored and inspectable.
- [ ] Dangerous verification work must be explicitly isolated.
- [ ] Benign verification work may run in-process only when its cleanup and scope are honest.
- [ ] Verification failures and meaningful regressions must be visible to the operator and user through shared product surfaces.
- [ ] Coverage, timing profiles, and similar artifacts are derived state, not canonical truth.
- [ ] Code or dependency changes must invalidate stale evidence through explicit dependency knowledge rather than hope.
- [ ] Local dev, CI, and prod must differ by authority, scheduling, and gating posture, not by becoming different products.

## Current Base

The first substrate already exists, but it is narrow:

- [~] platform-owned gate catalogs and test execution paths already exist in `plugin.platform`
- [~] background platform test monitoring now exists as a runtime-owned path rather than only a manual command
- [~] change-set validation can already schedule selected verification work against candidate snapshots
- [~] runtime profiles, backend seams, operator lifecycle, and diagnostics are already explicit enough to host a richer verification story
- [ ] verification policy is not yet a fully authored WTOML contract
- [ ] isolation classes are still coarse and execution is still mostly command-oriented
- [ ] reverse-DAG invalidation is not yet first-class
- [ ] coverage, timing, and regression evidence are not yet modeled as first-class cached artifacts
- [ ] user-facing regression/failure surfacing is not yet integrated into the shared frontend warning story

## Tranche Overview

| Tranche | Theme | Main Outcome | Status |
| --- | --- | --- | --- |
| 0 | Honesty floor | Tests become a runtime concern without creating a fake second product | active base |
| 1 | Authored verification policy | WTOML-declared gates, scheduling defaults, and environment posture | [ ] |
| 2 | Isolation and execution classes | Pure/in-process versus dangerous/isolated execution made explicit | [ ] |
| 3 | Dependency graph and invalidation | Reverse-DAG-aware cache invalidation for stale evidence | [ ] |
| 4 | Artifact and provider model | Coverage, timing, logs, and profiles become explicit derived artifacts | [ ] |
| 5 | Runtime scheduler and budgets | Background, low-contention verification with authored resource policy | [ ] |
| 6 | Product and operator surfaces | Failures, regressions, stale evidence, and health become visible in-product | [ ] |
| 7 | Change-set and candidate gating | Verification integrates with proposals, branches, change sets, and candidate snapshots | [ ] |
| 8 | Unified local dev / CI / prod posture | Same runtime story, different authority and approval posture | [ ] |

## Tranche 0. Honesty Floor

### Goal

Anchor verification inside the runtime without pretending the first slice is already the final system.

### Required Invariants

- [ ] verification must use explicit runtime-owned seams
- [ ] failures must stay visible
- [ ] ad hoc external scripts must not become the canonical source of truth
- [ ] any framework use must remain subordinate to the authored runtime model

### Shipped Base

- [~] platform gate catalog
- [~] runtime-owned background test monitor
- [~] selected gate execution from source changes
- [~] selected gate execution from change-set validation
- [~] serialized execution to avoid accidental self-contention in the first slice

### Next Outcomes

- [ ] keep all new verification state attached to explicit runtime objects, not hidden globals
- [ ] define the authored nouns before growing more execution complexity
- [ ] preserve narrow-but-real behavior while the richer policy model lands

## Tranche 1. Authored Verification Policy

### Goal

Move from hard-coded gate metadata to authored verification policy.

### Scope

- WTOML-declared verification gates
- runner or environment policy
- default scheduling posture
- profile-specific verification rules
- declared failure thresholds and regression policies

### Desired End State

- [ ] a runner can declare which gates exist, what they verify, and when they should run
- [ ] the runtime can start and immediately know whether validation is fresh, stale, missing, or blocked
- [ ] local dev, CI, and prod can select the same gates under different authority or timing rules

### Immediate Work

- [ ] define authored verification nouns such as `verificationGate`, `verificationSuite`, `verificationPolicy`, and `verificationArtifact`
- [ ] decide whether these live as standalone WTOML objects, `serverRunner` declarations, or both
- [ ] let policy declare defaults such as `enabled`, `startup`, `watch`, `onChangeSet`, `maxConcurrency`, and `priority`
- [ ] let policy declare regression thresholds such as timing deltas, failure budgets, or minimum coverage floors

### Dependencies

- tranche 0 honesty floor
- tranche 8 posture model for environment-specific overrides

## Tranche 2. Isolation and Execution Classes

### Goal

Make isolation explicit so dangerous work does not leak through benign execution paths.

### Scope

- pure or in-process checks
- child-process execution
- browser-hosted execution
- candidate-snapshot execution
- cleanup contracts
- timeout and leak handling

### Desired End State

- [ ] each gate declares its execution class
- [ ] each execution class has explicit lifecycle, cleanup, timeout, and witness semantics
- [ ] the runtime can run pure gates cheaply without pretending browser or side-effect-heavy gates are equally safe

### Immediate Work

- [ ] define first execution classes such as `in_process`, `child_process`, `browser_session`, and `candidate_snapshot`
- [ ] add explicit purity or danger metadata and cleanup expectations
- [ ] make scheduler decisions and warnings depend on those classes
- [ ] treat isolation failure as a first-class verification result rather than an incidental crash

### Dependencies

- tranche 1 authored policy
- tranche 5 scheduler
- tranche 7 candidate snapshot integration

## Tranche 3. Dependency Graph and Invalidation

### Goal

Invalidate verification evidence from explicit dependency knowledge rather than timestamps alone.

### Scope

- source-to-gate dependencies
- reverse-DAG invalidation
- provider/config dependency edges
- change-set affected-scope selection
- stale evidence reasoning

### Desired End State

- [ ] a source or config change can mark exactly which gates and artifacts became stale
- [ ] dependency changes in runtime config, plugin composition, or providers can invalidate affected evidence too
- [ ] the system can explain why a result is stale, not only that it is stale

### Immediate Work

- [ ] define dependency edges between authored sources, runtime bundles, plugin packages, capabilities, and verification gates
- [ ] store invalidation reasons as explicit metadata
- [ ] extend current path-based gate selection into reverse-DAG-aware selection
- [ ] include provider or environment binding changes in invalidation logic

### Dependencies

- tranche 1 authored policy
- tranche 4 artifact model
- tranche 7 platform graph integration

## Tranche 4. Artifact and Provider Model

### Goal

Treat verification outputs as explicit derived artifacts with provider-backed storage.

### Scope

- coverage artifacts
- timing profiles
- logs
- benchmark history
- snapshot outputs
- provider-backed artifact storage

### Desired End State

- [ ] coverage, timing, logs, and benchmark evidence are queryable artifacts with provenance
- [ ] artifact storage can use local disk, SQLite, S3, Redis, or other declared providers depending on role
- [ ] the system can retain metadata in-repo or in-world while large payloads move to the right data plane

### Immediate Work

- [ ] define logical storage roles such as `verification.cache`, `verification.artifact`, and `verification.history`
- [ ] bind those roles through the same runtime-config/provider story as other backend seams
- [ ] distinguish lightweight committed metadata from heavyweight external payloads
- [ ] attach artifact provenance to runtime revision, gate, execution class, environment posture, and dependency hash

### Dependencies

- tranche 3 invalidation
- tranche 8 environment posture
- backend seam provider contracts

## Tranche 5. Runtime Scheduler and Budgets

### Goal

Run verification continuously without blocking the main product experience.

### Scope

- background scheduling
- one-core or low-concurrency operation
- prioritization
- fairness
- contention avoidance
- startup behavior

### Desired End State

- [ ] startup can trigger verification without blocking page load or primary request handling
- [ ] policy can request slow default operation such as one worker or one core
- [ ] faster operation remains an explicit authored override rather than the default
- [ ] the scheduler can defer, serialize, or shed work honestly under load

### Immediate Work

- [ ] make concurrency and CPU-budget policy authored rather than implicit
- [ ] separate urgent gates from best-effort background gates
- [ ] add queueing, debounce, and dedupe semantics for repeated source changes
- [ ] make stale-but-known state visible while background work is still catching up

### Dependencies

- tranche 1 authored policy
- tranche 2 isolation classes
- tranche 6 product surfaces

## Tranche 6. Product and Operator Surfaces

### Goal

Expose verification truth through the product rather than burying it in logs.

### Scope

- frontend warnings
- backend diagnostics
- regression summaries
- stale verification state
- health surfaces
- operator repair controls

### Desired End State

- [ ] users can see when the product is failing, degraded, or statistically regressing
- [ ] operators can inspect what ran, what failed, what is stale, and what is blocked
- [ ] warnings become stronger when authority or environment posture demands it

### Immediate Work

- [ ] project verification state into shared frontend warning surfaces
- [ ] distinguish hard product failure from degraded confidence and from stale evidence
- [ ] surface regression explanations such as "timing regressed 28% over last good baseline"
- [ ] add operator actions for rerun, quarantine, invalidate, and repair where honest

### Dependencies

- tranche 4 artifacts
- tranche 5 scheduler
- tranche 8 authority and posture model

## Tranche 7. Change-Set and Candidate Gating

### Goal

Make verification part of platform change flow rather than a side task.

### Scope

- branches
- change sets
- candidate snapshots
- proposal review
- validation before activation

### Desired End State

- [ ] every meaningful change can point at its required verification evidence
- [ ] candidate snapshots can run the right gates before activation
- [ ] review can see verification freshness, failures, and regression deltas in the same change flow

### Immediate Work

- [ ] connect authored verification gates to `changeSet` and `candidateSnapshot` objects
- [ ] make gate requirements explicit on different mutation families
- [ ] preserve last-known-good runtime when candidate validation fails
- [ ] add proposal and review affordances for verification exceptions or waivers when authority allows them

### Dependencies

- tranche 1 authored policy
- tranche 2 candidate snapshot execution class
- tranche 3 invalidation
- platform self-model roadmap

## Tranche 8. Unified Local Dev / CI / Prod Posture

### Goal

Keep one product and one runtime story while letting environments differ honestly.

### Scope

- authority posture
- approval gates
- default concurrency
- allowed execution classes
- severity of user-facing warnings
- storage/provider bindings

### Desired End State

- [ ] local dev, CI, and prod all run the same verification model
- [ ] CI is a runtime posture, not a separate system concept
- [ ] prod can be stricter without becoming a different product
- [ ] users and operators can inspect which posture is active and what it changes

### Immediate Work

- [ ] define posture dimensions explicitly: authority, scheduling, mutation rights, verification strictness, and artifact retention
- [ ] decide what "prod gated" means in runtime terms rather than only social convention
- [ ] let storage bindings vary by posture while preserving the same logical artifact model
- [ ] ensure stronger prod warning UX without training users into complacency

### Dependencies

- authority model
- shells/persistence contract
- backend seam provider bindings

## Recommended Execution Order

1. Finish tranche 1 so verification policy stops being mainly hard-coded.
2. Land tranche 2 and tranche 5 together so execution safety and scheduling evolve as one system.
3. Land tranche 3 and tranche 4 together so invalidation and artifact storage share the same model.
4. Deepen tranche 6 once the artifact model is good enough to explain failures honestly.
5. Expand tranche 7 so change-set and candidate flows consume the same verification evidence.
6. Finish tranche 8 by collapsing "CI" into a runtime posture instead of a separate conceptual product.

## What This Document Should Prevent

- building a second test product beside the runtime
- treating coverage or timing history as hidden canonical truth
- hard-coding environment-specific behavior that breaks the shared model
- treating all tests as equally safe to run in-process
- making prod stricter by hiding more state instead of surfacing more truth
