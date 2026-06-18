# 11 - Platform Self-Modeling, Verification & Knowledge

## Role in Primary Intent

The platform must dogfood itself. Intents, proposals, branches, docs, tests, verification gates, change sets, and runtime observations all live inside the same inspectable world model. ContextHub and the Intent Registry exist to keep intent, knowledge, proof, and code near each other instead of in separate kingdoms.

See [../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md), [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md), [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md), [../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md).

## Core Desires / Intents

### 11.1 Platform models its own change as first-class objects
End-state flow (from PLATFORM-ALL-THE-WAY):
```
intent → proposal → branch / change set → candidate snapshot → dependency analysis
→ docs / test / telemetry gates → defect and proposal feedback → review
→ atomic apply → push / ship → live observation → meta-analysis
```

**Enacted:**
- [../../plugins/platform/](../../plugins/platform/) is the home:
  - platform-model.js (builds the graph, links docs to roles)
  - platform-proposals.js (templates)
  - branch-insights.js, change-sets.js, test-runs.js, test-gate-catalog.js
  - platform-page.js, platform-console.rvm + .wcss
- `/platform` surface, `/api/platform-model`, `/api/platform-proposals`, `/api/platform-gaps`
- MCP lanes: `platform.read`, `platform.proposal`, `platform.self` capability.

### 11.2 Intent registry + stable intent linkage
Intents are not just tasks or docs. They are the scaffold that keeps why, who, what, proof, and drift visible.

**Defined:**
- [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md): intent, intentRegistryEntry, knowledgeFacet, alignmentDebt, etc.
- Tranches: 0 (floor) through 6 (bot alignment)

**Current enactment:**
- This `docs/intent/` directory (and the 12 category files) is direct realization of the registry floor + categorization tranche.
- Platform model links specific docs (CAPABILITIES, SHELLS, AUTHORING-REPLAY-PLAYBOOK, etc.) with actor roles.
- ContextHub spec defines the surface that will make the registry navigable inside the product.

### 11.3 Continuous verification: tests, gates, and reports linked to intent
Verification is not a separate control plane.

**Enacted / planned:**
- [../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md)
- plugins/platform/test-* files, flake scoring, gate catalog.
- Scripts: scripts/run-tests.mjs, run-plugin-tests.mjs
- RVM-authored tests and reports are modeled objects.

### 11.4 ContextHub as the near-context knowledge + intent alignment layer
Not a second wiki. It reduces context loss between branches (code changes), docs (intent), tests (proof), and LLMs/humans.

**Defined in:**
- [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md)
- Surfaces: intent list/detail, linked reports, docs, features, gaps.
- APIs: `/api/context-hub/intents`, knowledge panels on `/platform`

### 11.5 Honesty discipline and visible alignment debt
Fake / stub / projection / real-but-narrow / compatibility-bridge vocabulary must be used explicitly. Drift is tolerated only when visible.

**Enacted:**
- Repeated in almost every major doc.
- Platform gaps API and console surface alignment debt.
- Generated scaffolds must be marked derived.

## Implementation Map

| Area                    | Key Locations                                                                 |
|-------------------------|-------------------------------------------------------------------------------|
| Platform graph & model  | plugins/platform/platform-model.js, branch-insights, test-runs, proposals    |
| Console surface         | plugins/platform/platform-page.js + platform-console.rvm + platform-style.js |
| Intent / registry work  | docs/INTENT-REGISTRY-ROADMAP.md + this docs/intent/ tree + CONTEXTHUB-SPEC   |
| Verification            | plugins/platform/test-gate-catalog.js + CONTINUOUS-VERIFICATION-ROADMAP      |
| Runtime diagnostics     | src/runtime-surface-diagnostics.js + engentus-dev-diagnostics plugin         |
| Authoring replay probe  | docs/AUTHORING-REPLAY-PLAYBOOK.md + scripts                                 |

## Current Status
- Platform console + proposal entry for platform nouns: real and in use.
- Intent registry scaffold (these files): newly created as the canonical list/tree realization.
- Full `/platform?view=knowledge` pivots and bot-assisted alignment: in roadmap tranches.
- Many existing docs already carry role annotations in the platform model.

## Cross References
- Depends on the entire model (02, 06, 07) so the platform can witness its own changes.
- Consumes all other categories as the subject matter being modeled.
- Enables safer evolution of every other intent.

## Primary Documentation
- [../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md)
- [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md)
- [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md)
- [../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md)
- [../../plugins/platform/](../../plugins/platform/) (the dogfooding implementation)
