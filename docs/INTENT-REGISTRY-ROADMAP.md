# Intent Registry Roadmap

This document defines the scaffold for keeping product knowledge, developer knowledge, system knowledge, admin knowledge, roadmap tasks, docs, and test evidence near the same platform intents.

The goal is not a perfect wiki.

The goal is:

- a near-context registry for why the system is changing
- stable intent ids that can outlive file moves
- classified knowledge facets per actor and system role
- explicit links between docs, tests, features, proposals, branches, and reports
- tolerated drift with visible alignment debt instead of hidden decay
- generated templates and bot-assisted alignment over time

Primary sources:

- [docs/PLATFORM-ALL-THE-WAY-ROADMAP.md](C:\Users\aaron\Documents\world\docs\PLATFORM-ALL-THE-WAY-ROADMAP.md)
- [docs/CONTINUOUS-VERIFICATION-ROADMAP.md](C:\Users\aaron\Documents\world\docs\CONTINUOUS-VERIFICATION-ROADMAP.md)
- [docs/CONTEXTHUB-SPEC.md](C:\Users\aaron\Documents\world\docs\CONTEXTHUB-SPEC.md)
- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)
- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md)

## Core Thesis

The platform should not treat documentation, tasks, and test evidence as separate kingdoms.

They are different facets of the same intents:

- what are we trying to do
- who is it for
- what system areas does it touch
- what docs explain it
- what tests prove it
- what proposals, branches, and features carry it
- what is stale, missing, disputed, or inferred

An intent registry is the scaffold that keeps those facets near each other.
`ContextHub` is the product surface and context-pack layer that makes that scaffold navigable and useful for humans and LLMs.
It does not need to be perfectly up to date at all times.
It needs to be present, linkable, and cheap to repair.

## Non-Negotiable Invariants

- [ ] Intent ids must be stable even when files move.
- [ ] Docs, tasks, tests, and features may be derived from files, but the registry row must not be only a raw path.
- [ ] Registry rows must be classifiable by context and actor.
- [ ] Drift is acceptable; hidden drift is not.
- [ ] Generated summaries and templates must be marked as derived artifacts, not canonical truth.
- [ ] Bots may propose alignment, but human-authored intent remains visible.
- [ ] Relative or concept-based references should be preferred over brittle absolute references inside generated documentation scaffolds.

## Proposed Core Objects

- [ ] `intent`
  - the human or agent goal statement
- [ ] `intentRegistryEntry`
  - the classified index row for an intent
- [ ] `knowledgeFacet`
  - a role-oriented slice such as product, developer, system, admin, operator, or actor-specific guidance
- [ ] `docNode`
  - a governed document linked into the registry
- [ ] `docTemplate`
  - a generated or semi-generated scaffold for missing nearby knowledge
- [ ] `alignmentDebt`
  - visible evidence that linked docs/tests/features have drifted

## Desired Registry Shape

Each intent registry row should be able to answer:

- `id`
- `title`
- `summary`
- `context`
- `actors`
- `owner`
- `status`
- `lifecycle`
- `knowledgeFacets`
- `linkedDocs`
- `linkedTasks`
- `linkedFeatures`
- `linkedTests`
- `linkedReports`
- `linkedProposals`
- `linkedBranches`
- `freshness`
- `alignmentDebt`

## Facet Taxonomy

The first useful facet set should be explicit and small:

- [ ] product
- [ ] developer
- [ ] system
- [ ] admin
- [ ] operator
- [ ] actor-facing
- [ ] roadmap
- [ ] test-report
- [ ] rationale

These are facets, not separate documentation systems.
One doc may serve several facets.

## Reference Strategy

Generated or maintained docs should prefer:

- stable doc ids
- platform concept ids
- intent ids
- section anchors when available
- relative or symbolic references that can be re-resolved

They should avoid depending only on:

- raw absolute file paths
- copied file-system locations with no concept id
- one-off wiki pages with no link back to platform objects

Absolute file references can still exist in the repo when useful, but the registry should not depend on them as its only identity layer.

## Tranche Overview

| Tranche | Theme | Main Outcome |
| --- | --- | --- |
| 0 | Registry floor | Intent rows exist as a scaffold, even if partially inferred |
| 1 | Classification | Docs and tasks are classified by actor, context, and facet |
| 2 | Linking | Intents link to docs, tests, features, proposals, branches, and reports |
| 3 | Freshness and drift | Alignment debt becomes visible and queryable |
| 4 | Generated scaffolds | Missing nearby docs get generated templates and outlines |
| 5 | Platform views | `/platform` knowledge surfaces pivot by intent and facet |
| 6 | Bot alignment | Agents can propose repairs, summaries, and cross-links over time |

## Tranche 0. Registry Floor

### Goal

Create the registry before trying to perfect it.

### Immediate Work

- [ ] derive initial registry rows from roadmap tasks, branch metadata, governed docs, and explicit proposal titles
- [ ] give each inferred row a stable id and provenance
- [ ] show when a row is inferred versus explicitly authored

## Tranche 1. Classification

### Goal

Make knowledge queryable by actor and need, not only by file path.

### Immediate Work

- [ ] classify docs by facet
- [ ] classify intents by context and actor
- [ ] let one intent link to multiple doc facets without duplication
- [ ] let one doc serve multiple intents when honest

## Tranche 2. Linking

### Goal

Make the registry the near-context hub for execution and explanation.

### Immediate Work

- [ ] link intent rows to roadmap tasks and feature rows
- [ ] link intent rows to verification gates, test runs, and RVM-authored test reports
- [ ] link intent rows to governed docs and doc sections
- [ ] link intent rows to proposals, branches, and change sets
- [ ] link intent rows to known runtime surfaces, capabilities, and routes where relevant

## Tranche 3. Freshness And Drift

### Goal

Treat drift as normal, but visible.

### Immediate Work

- [ ] mark registry rows stale when linked code or tests move ahead of nearby docs
- [ ] surface missing-facet gaps such as "has developer docs but no actor-facing docs"
- [ ] surface missing-proof gaps such as "feature described but no linked verification gate or report"
- [ ] record unresolved drift as `alignmentDebt`

## Tranche 4. Generated Scaffolds

### Goal

Make it cheap to repair missing nearby knowledge.

### Immediate Work

- [ ] generate doc templates for missing product, developer, or system facets
- [ ] generate report templates for linked test/report facets
- [ ] generate branch-level documentation obligations for significant changes
- [ ] keep generated text explicitly marked as derived and reviewable

## Tranche 5. Platform Views

### Goal

Expose the registry through the same platform surfaces rather than a second wiki product.

### Immediate Work

- [ ] extend `/platform?view=knowledge` with intent-focused list and detail pivots
- [ ] allow knowledge detail to pivot by facet and actor
- [ ] surface linked reports, docs, features, and tests on the same detail page
- [ ] preserve RVM ownership of the visible knowledge panels

## Tranche 6. Bot Alignment

### Goal

Use agents to reduce drift without pretending drift disappears.

### Immediate Work

- [ ] add bot-suggested cross-links as proposals or reviewable derived artifacts
- [ ] add bot-generated "docs to update" and "missing facet" summaries
- [ ] let bots draft but not silently finalize meaningful intent alignment
- [ ] retain provenance for bot-authored repairs

## Practical Rule

If a branch, feature, or verification report matters and it has no nearby intent row, the system should create a scaffold rather than waiting for perfect taxonomy.

Cheap, visible, repairable structure is better than perfect absence.
