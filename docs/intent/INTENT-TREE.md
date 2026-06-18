# Intent Tree

Root node is the **Primary Intent** (executive summary / overall goal).

Each node links back to relevant documentation and implemented code.

Relative links are written from `docs/intent/`.

```
Primary Intent (Witness-Oriented Platform)
│
├── 1. [Foundational Philosophy & Ontology](./01-foundational-philosophy-ontology.md)
│   ├── Preserve continuity of agency through witnessed memory
│   │   └── [../SYSTEM.md](../SYSTEM.md) | Genesis axiom
│   ├── Irreducible ontology (Thing, Relation, Process, Witness)
│   │   └── [../SYSTEM.md](../SYSTEM.md) | derived: Soul, Ownership, Stewardship, Authority, Proxy, Perspective, Governance
│   └── Anti-goal: never a social-credit / final-judgement system
│
├── 2. [Witness Substrate & Projections](./02-witness-substrate-projections.md)
│   ├── Append-only witness log = sole durable source of truth
│   │   ├── [../CAPABILITIES.md](../CAPABILITIES.md#11-witness-log-and-projection-substrate)
│   │   └── [../../src/witness-log.js](../../src/witness-log.js)
│   ├── All durable meaning and read views are derived projections
│   │   ├── [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js)
│   │   └── [../../src/projectors-core.js](../../src/projectors-core.js)
│   └── Replay, snapshot, and recovery remain first-class
│
├── 3. [Semantic Authoring Kernel (DESIRE)](./03-semantic-authoring-kernel.md)
│   ├── DESIRE = minimal canonical semantic kernel
│   │   ├── [../DESIRE.md](../DESIRE.md)
│   │   ├── [../experiment/new-desire/DESIRE-KERNEL.md](../experiment/new-desire/DESIRE-KERNEL.md)
│   │   └── [../../src/desire/ir.js](../../src/desire/ir.js) (DESIRE_KERNEL_KINDS)
│   ├── DESIRE+ = source/debug IR preserving authored structure above kernel
│   │   ├── [../experiment/new-desire/DESIRE-PLUS.md](../experiment/new-desire/DESIRE-PLUS.md)
│   │   └── [../../src/desire/elaborate.js](../../src/desire/elaborate.js)
│   ├── Honest lowering from source languages (WTOML, RVM)
│   │   ├── [../../src/desire/wtoml.js](../../src/desire/wtoml.js)
│   │   ├── [../../src/desire/rvm.js](../../src/desire/rvm.js)
│   │   └── [../../src/desire/apply.js](../../src/desire/apply.js)
│   └── Constraint: kernel contains no routes, no DOM, no transport, no plugin install wiring
│
├── 4. [Composition Primitives & Authoring](./04-composition-primitives-authoring.md)
│   ├── First-class modeled primitives (context, entity, message, store, type, process, projection, dataflow, surface, capability, boundary, policy, graph)
│   │   └── [../../src/desire/ir.js](../../src/desire/ir.js) + [../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives)
│   ├── Declarative composition of routes, serves, serverRunners, widgets, and programs
│   │   └── [../../src/runtime-routing.js](../../src/runtime-routing.js), [../../src/dsl.js](../../src/dsl.js)
│   ├── Shared specs drive both authoring UI and runtime validation
│   └── Bootstrap seam that recovers blank world into runnable app via real modeled surfaces
│       └── [../../plugins/bootstrap/](../../plugins/bootstrap/)
│
├── 5. [Capabilities, Plugins & Extensibility](./05-capabilities-plugins-extensibility.md)
│   ├── Capabilities as first-class inspectable objects (install, catalog, placement, authority requirements)
│   │   └── [../../plugins/capability-authoring/](../../plugins/capability-authoring/), [../../src/capability-*.js](../../src/)
│   ├── Plugins contribute via explicit extension points (never hidden host behavior)
│   │   └── [../../src/runtime-plugin-loader.js](../../src/runtime-plugin-loader.js) + desireExtensions
│   └── "Glass atoms": installed capabilities stay visible and queryable
│
├── 6. [Identity, Context, Authority & Governance](./06-identity-context-authority-governance.md)
│   ├── Actor-centric authority tuple (authenticated/effective + direct/assumed/service)
│   │   └── [../AUTHORITY-MODEL.md](../AUTHORITY-MODEL.md)
│   ├── Context = primary semantic, naming, visibility, and authority boundary
│   │   └── [../../src/context-naming-world.js](../../src/context-naming-world.js)
│   ├── Stewardship / delegation / ownership are witnessed projections (never stored tables)
│   ├── All important mutations flow through proposal + approval
│   │   ├── [../../plugins/proposals/](../../plugins/proposals/)
│   │   └── [../../src/runtime-governance.js](../../src/runtime-governance.js)
│   └── Live proposal paths refresh rendered surfaces through the witness stream
│
├── 7. [Runtime Execution, Processes & Inspection](./07-runtime-execution-processes-inspection.md)
│   ├── Explicit process model (state + rules over messages/commands)
│   │   ├── [../../src/desire/process-eval.js](../../src/desire/process-eval.js)
│   │   └── [../../src/runtime-execution-runner.js](../../src/runtime-execution-runner.js)
│   ├── Execution graphs, traces, and replay
│   │   └── [../../src/process-graph.js](../../src/process-graph.js)
│   ├── First-class inspection surfaces
│   │   └── [../../plugins/inspect/](../../plugins/inspect/) (world graph, process view, source, witnesses, live inspector)
│   └── Canvas spatial surface as first-class world expression
│       └── [../../plugins/canvas/](../../plugins/canvas/)
│
├── 8. [Product Experience, Guidance & Academy](./08-product-experience-guidance-academy.md)
│   ├── Attractive real Todo facade as minute-0 landing (seeded "be a sourcerer")
│   │   └── [../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md)
│   ├── Physical/spatial reveal ("zoom out") rather than wizard overlay
│   ├── Bounded first agency (Personal Box) before broad stewardship
│   ├── Named capability gates (visible before unlocked)
│   ├── Sourcery = optional truthful companion (never mandatory steering)
│   │   └── runtime-guidance-* under [../../src/](../../src/)
│   └── Academy / quests driven from witnessed practice and persisted tutorial progress
│       └── [../../plugins/eden/](../../plugins/eden/), [../../plugins/tutorial/](../../plugins/tutorial/)
│
├── 9. [Surfaces & Editing Grammar](./09-surfaces-editing-grammar.md)
│   ├── Semantic surfaces in the kernel (not renderer-specific DOM trees)
│   ├── Editable-everywhere interaction model (inspect, hide, replace, restyle, upgrade in place)
│   ├── Versioned artifacts with witnessed activate/rollback
│   └── Safe local personalization (theme, light, typography, mood) as on-ramp to authorship
│
├── 10. [Shells, Persistence & Ecosystem](./10-shells-persistence-ecosystem.md)
│   ├── Single coherent world model across shells
│   ├── Desktop shell = narrow but real first ownership adapter
│   │   └── [../../src/desktop-main.js](../../src/desktop-main.js), [../../src/desktop-*.js](../../src/)
│   ├── Operator-owned persistence (WORLD_HOME) as preferred contract
│   └── Shell posture changes risk, authority gates, and presentation severity only
│       └── [../SHELLS-PERSISTENCE-ECOSYSTEM.md](../SHELLS-PERSISTENCE-ECOSYSTEM.md)
│
├── 11. [Platform Self-Modeling, Verification & Knowledge](./11-platform-self-modeling-verification-knowledge.md)
│   ├── Platform dogfoods its own change graph (intent → proposal → branch → gate → apply → observation)
│   │   ├── [../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md)
│   │   └── [../../plugins/platform/](../../plugins/platform/)
│   ├── Intent registry + stable intent linkage
│   │   └── [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md)
│   ├── ContextHub = near-context knowledge + intent alignment surface
│   │   └── [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md)
│   └── Continuous verification with tests/reports linked to intent
│       └── [../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md)
│
└── 12. [Backend & External Integration Seams](./12-backend-external-integration-seams.md)
    ├── External concerns modeled exclusively as explicit boundary capabilities
    │   └── [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md)
    ├── Providers (http-outbound, oauth, notifications, fs-*, sql-*, jobs, webhooks, MCP)
    │   └── See [../../plugins/](../../plugins/) (http-outbound, oauth, notifications, fs-*, sqlite, sql, jobs, webhooks, mcp, mcp-authoring)
    └── Host privileges must never become the implicit product contract
```

## How to Read the Tree

- Depth reflects layering: foundations → kernel → composition → governance → runtime & experience → self-reflection.
- Every leaf intent should eventually have:
  - Documentation explaining the desire
  - Code realizing (or partially realizing) it
  - Tests / verification evidence
- Drift is expected; the tree + linked registry makes drift visible.

## Detailed Category Files

Each of the 12 top-level branches has a dedicated deep-dive file with formal definitions, exact code locations, honesty status, and cross-links:

1. [01-foundational-philosophy-ontology.md](./01-foundational-philosophy-ontology.md)
2. [02-witness-substrate-projections.md](./02-witness-substrate-projections.md)
3. [03-semantic-authoring-kernel.md](./03-semantic-authoring-kernel.md)
4. [04-composition-primitives-authoring.md](./04-composition-primitives-authoring.md)
5. [05-capabilities-plugins-extensibility.md](./05-capabilities-plugins-extensibility.md)
6. [06-identity-context-authority-governance.md](./06-identity-context-authority-governance.md)
7. [07-runtime-execution-processes-inspection.md](./07-runtime-execution-processes-inspection.md)
8. [08-product-experience-guidance-academy.md](./08-product-experience-guidance-academy.md)
9. [09-surfaces-editing-grammar.md](./09-surfaces-editing-grammar.md)
10. [10-shells-persistence-ecosystem.md](./10-shells-persistence-ecosystem.md)
11. [11-platform-self-modeling-verification-knowledge.md](./11-platform-self-modeling-verification-knowledge.md)
12. [12-backend-external-integration-seams.md](./12-backend-external-integration-seams.md)

See also [README.md](./README.md) for the full index.

### Authorable Model Form

The relationships (doc ↔ doc and doc ↔ code) are expressed declaratively in WTOML for ContextHub consumption:

- [knowledge-relations.wtoml](./knowledge-relations.wtoml)

Uses `[[entity]]` for docNodes + code locations and `[[relation]]` (explains, isRealizedBy, references, expands, etc.). This is the direction for turning static intent links into first-class witnessed platform objects.

---

Back to entry: [README.md](./README.md) | [CATEGORIZED-LIST.md](./CATEGORIZED-LIST.md)
