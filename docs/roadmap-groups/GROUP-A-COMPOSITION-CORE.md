# Group A - Composition Core

`/goal` Express composition, naming, authority, and reusable package or plugin authorship through first-class platform nouns, while aggressively resisting global-id shortcuts, hidden JS semantics, and fake merge simplicity.

This group combines tranche 1 and tranche 2:

- capability core and composition
- context, identity, and authority
- plugin or package authoring model
- contextual naming and authority convergence

## Mission

Make the platform's compositional units real enough that a world can declare:

- what capabilities exist
- where they are installed
- who may mutate them
- how names resolve
- how package or plugin changes are authored and merged

without falling back to hidden runtime conventions.

## End-State

Group A is done when all of the following are true:

- capabilities are first-class authored objects with clean install, remove, update, and compatibility semantics
- context is the normal boundary for names, ownership, import/export, and local meaning
- authority and proposal flows cover all important mutation surfaces
- legacy capability-string and broad canonical-id compatibility paths are either removed or explicitly fenced
- plugin or package authoring has a first-class authored story instead of being only a filesystem side channel
- the system can explain competing or concurrent authored changes without hand-wavy merge magic

## Non-Goals

- inventing a remote app store before local composition is coherent
- adding more hidden host shortcuts for app semantics
- collapsing all naming into one global id soup

## Guardrails For New Contributors

This group is where a conventional software engineer is most likely to make a mess by reaching for normal application architecture.

The most dangerous shortcuts here are:

- inventing a global registry because contextual naming feels inconvenient
- adding one more id-based escape hatch because contextual resolution is incomplete
- encoding capability semantics in host JS because the authored model feels slower
- treating plugin authorship as a filesystem convention only
- resolving merge pressure by destructive overwrite instead of explicit coexistence and convergence

### Hard Rules

- if a new reusable concept appears, first ask whether it needs an authored noun
- if a name resolves differently by place or owner, model the context rule instead of hiding it in lookup code
- if authority matters, use the shared authority or proposal path rather than a route-local check
- if compatibility sugar is required, label it as sugar and add a path off it
- if plugin or package behavior is introduced, keep the authorship and emitted bundle inspectable

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- a canonical id was smuggled through instead of contextual resolution
- a capability definition was synthesized implicitly with no migration path
- an install succeeded without explicit compatibility reasoning
- a mutating route bypassed proposal fallback because "the UI already checked"
- a patch or package format cannot explain concurrent or conflicting authored changes

## Workstreams

### A1. Capability Object Maturity

Move from first-class capability definitions to a real lifecycle:

- authored create
- install
- remove
- replace
- update
- compatibility evaluation
- migration from old forms

### A2. Context As Real Boundary

Finish the move from "some contextual refs exist" to "context is how names and local composition work."

### A3. Unified Authority and Proposal Execution

Bring the remaining app-specific and operating-surface mutations under one shared authority and proposal path.

### A4. Package or Plugin Authorship Model

Decide and implement the authored unit for reusable composition.

Candidate direction suggested by current discussion:

- plugin authorship happens through MCP
- authoring produces a canonical `wtoml` patch bundle
- bundle entries are deterministically ordered
- concurrent revisions can coexist under different identities or namespaces
- runtime can choose side A or side B while a later transformer or merge resolves them

This direction is not shipped.
It needs an explicit design and execution path.

### A5. Merge, Namespace, and Convergence Semantics

If patch-first authorship is chosen, the platform needs a truthful story for:

- concurrent authorship
- collision detection
- coexistence under namespace or identity splits
- later convergence through an explicit transformer

## Ordered Execution Ladder

### Stage A0. Stabilize Current Honesty Floor

Objective:
Do not let placeholder composition paths calcify while new work lands.

Slices:

- tag and inventory every remaining legacy capability-string synthesis path
- tag and inventory every remaining canonical-id compatibility path
- tag every mutation route not yet using shared authority derivation
- publish one compatibility ledger projection so these bridges are inspectable

Done when:

- every bridge has one named owner
- every bridge is reachable in diagnostics or an inspector surface
- no new bridge lands without documentation

### Stage A1. Finish Capability Lifecycle Semantics

Objective:
Capabilities stop being just installable nouns and become maintainable product units.

Slices:

#### A1.1 Capability version and compatibility contract

Implementation:

- define the authored compatibility fields beyond facet presence
- include minimum runtime profile, authority assumptions, dependency constraints, and migration notes
- add a compatibility evaluator with machine-readable reasons

Acceptance:

- install attempts can fail with specific structured reasons
- review surfaces show why a capability can or cannot land
- tests cover valid, blocked, incompatible, and replaceable installs

#### A1.2 Capability update and replacement flow

Implementation:

- add explicit update intent instead of remove-plus-install as hidden policy
- define replace semantics for same capability id, new revision
- define downgrade or rollback semantics

Acceptance:

- a capability revision change is visible as its own witnessed operation
- dependency and authority checks run before the switch
- rollback is explicit, not a manual repair ritual

#### A1.3 Migrate off placeholder legacy capability synthesis

Implementation:

- introduce a migration writer from legacy `context.capabilities` and host strings into real capability objects plus installs
- surface migration preview before commit
- allow compatibility read mode until migration is complete

Acceptance:

- old worlds can be upgraded through an authored path
- projection-only placeholder capability objects stop being required for normal operation

### Stage A2. Make Context The Default Naming System

Objective:
Names become local, inspectable, and composable.

Slices:

#### A2.1 Extend contextual ref lowering across all core authoring nouns

Implementation:

- enumerate all remaining authored reference fields
- add contextual resolution and visibility checks to each
- keep canonical ids only where explicitly justified

Acceptance:

- new authoring flows default to contextual references
- foreign targets require explicit visibility
- tests cover local, imported, hidden, and ambiguous names

#### A2.2 Context read models become explanation surfaces

Implementation:

- add projections for local bindings, imports, exports, shadowing, and conflicts
- add "why this name resolves here" inspection
- add "why this target is not visible" diagnostics

Acceptance:

- a user can explain any contextual reference from product surfaces
- name collision cases are visible before mutation

#### A2.3 Decide the long-term role of canonical-id sugar

Implementation:

- split canonical-id usage into allowed classes:
  - same-context convenience
  - imported-target reference
  - legacy-only path
- choose which remain permanent and which are deprecation-only

Acceptance:

- policy is explicit in docs and validation
- compatibility sugar stops expanding accidentally

### Stage A3. Unify Authority and Proposal Coverage

Objective:
Mutation governance stops being route-by-route folklore.

Slices:

#### A3.1 Route inventory and normalization

Implementation:

- list every mutating route and command surface
- classify each as direct-authority, proposal-fallback, operator-only, or missing
- normalize request and execution helpers

Acceptance:

- no mutating route is uncategorized
- shared helpers own the evaluation path

#### A3.2 Proposal support for remaining high-value surfaces

Priority order:

1. remaining widget and version operations
2. remaining app CRUD surfaces
3. remaining canvas or asset mutations
4. runtime-plugin and MCP mutations not yet fully parallel to direct execution

Acceptance:

- unauthorized signed-in users create real proposals instead of dead-end failures
- approved proposals execute through the same helpers as direct writes

#### A3.3 Personal versus shared semantics contract

Implementation:

- formalize actor-scoped, perspective-scoped, and context-shared state classes
- unify private notes, theme, session defaults, and future actor projections under one contract

Acceptance:

- each mutable surface declares whether it is shared, personal, or mixed
- witness visibility and authority rules match that declaration

### Stage A4. Plugin or Package Authorship Model

Objective:
Reusable composition becomes expressible through the platform itself.

Decision question:

Should the reusable unit be expressed as:

- manifest plus filesystem package
- patch-first package revision
- authored object model that lowers to patch bundles

Recommended sequence:

#### A4.1 Define the authored nouns

Possible nouns:

- `package`
- `packageRevision`
- `packagePatch`
- `packageNamespace`
- `packageDependency`

Acceptance:

- the model can represent a reusable unit without assuming an external toolchain first

#### A4.2 Canonical bundle format

Implementation:

- choose canonical `wtoml` ordering rules
- define stable serialization
- define content-addressed or UUID-addressed entries where needed
- define how metadata, manifests, and patches coexist

Acceptance:

- two identical authored revisions serialize identically
- diff and patch review are deterministic

#### A4.3 MCP-mediated authorship flow

Implementation:

- define MCP tool contracts for create package, emit patch, preview apply, and publish revision
- scope those tools through existing authority and install rules
- ensure emitted output is inspectable and replayable

Acceptance:

- plugin authorship can happen through the explicit MCP seam
- MCP is not bypassing the normal world model

### Stage A5. Namespace and Merge Convergence

Objective:
Concurrent authored changes become composable instead of destructive by default.

Slices:

#### A5.1 Divergent revision coexistence

Implementation:

- allow two conflicting revisions to exist under distinct identities
- let runtime selection choose one branch explicitly
- record the coexistence instead of forcing premature collapse

Acceptance:

- conflict does not require immediate destructive resolution
- runtime and review surfaces can show branch A and branch B

#### A5.2 Transformer-based convergence

Implementation:

- define a first transformer contract for mapping one namespace or revision space into another
- allow authored convergence patches
- show which glue remains because references are not yet zero or unified

Acceptance:

- convergence work is explicit and inspectable
- the system can explain when glue is still required

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Add a compatibility-bridge inventory projection and route.
2. Enumerate remaining mutating routes and classify governance coverage.
3. Add missing contextual-ref lowering coverage for authored core nouns.
4. Write the capability compatibility schema and evaluator contract.
5. Design the authored package or patch nouns in a dedicated spec.
6. Prototype canonical `wtoml` ordering and deterministic serialization tests.
7. Define MCP tool shapes for package or patch authoring.

### "Trivialized" implementation breakdown for the first three slices

#### Compatibility bridge inventory

- add one source-of-truth list in code for known bridges
- project that list into diagnostics
- expose one bootstrap or inspector read surface
- add one test that fails when an unregistered bridge is emitted

#### Governance route inventory

- search for mutating handlers
- annotate each with a governance mode
- fail tests when a new mutating handler has no governance annotation
- project the annotation catalog for operator review

#### Contextual ref coverage

- enumerate reference-bearing fields in the schema
- add lowering helpers for one noun at a time
- add ambiguity and visibility tests per noun
- remove direct canonical-id fallback only after tests and diagnostics exist

## Acceptance Gates

This group only counts as materially advanced when:

- composition rules are more explicit than before, not just more convenient
- migration off compatibility bridges has started in code, not only in docs
- plugin or package authorship has a declared owning noun
- namespaces and merge semantics are treated as product concerns, not postponed folklore
- new contributors would be forced toward context, capability, and authority semantics rather than easy global-id shortcuts

## Primary Source Map

- [ROADMAP.md](../ROADMAP.md)
- [BASELINE.md](../BASELINE.md)
- [docs/CAPABILITIES.md](../CAPABILITIES.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
