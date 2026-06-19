# Collaborative Operator Environment Product Direction

This document sets a product direction for turning the current platform into a coherent operator environment: a shared live system where browser surfaces, terminal/TUI workflows, VS Code authorship, provenance, preview editing, collaboration, and platform self-inspection all sit on top of one modeled runtime.

It is intentionally broader than the current Engentus debug sidecar work. The sidecar is a useful proving ground, but it is not the product boundary.

The thesis is simple:

- one engine
- many frontends
- one modeled world
- many representations
- explicit status over false purity
- first-class collaboration instead of screen-sharing and guesswork

---

## 1. Product Thesis

The platform should become a modern mainframe for live applications.

That means:

- live application state is inspectable, addressable, and governable
- authored sources, runtime state, capabilities, sessions, and diagnostics are one connected world
- users can operate through a browser, a TUI, or VS Code without switching truths
- every important object has identity, provenance, deep links, and representations
- proxy identities, speculative artifacts, and social overlays are allowed when their status and mapping are explicit
- collaboration is structured and reversible, not theater over a video call

The product is not:

- just a debug panel
- just a terminal
- just a VS Code extension
- just a platform console

The product is:

- a shared operator environment over the live modeled system

---

## 2. Imagine If

Imagine if collaboration on a live application no longer meant:

- "which screen are you on?"
- "what object are you pointing at?"
- "paste me the id"
- "can you click that again?"
- "I changed something but I can't reproduce it"
- "let me share screen"
- "wait, don't touch that"

Imagine if instead:

- you attach to the same session
- you can see what another person is focused on, if policy allows
- `this` means the currently selected thing
- `a = this` stores a local alias to the resolved target
- you can inspect, edit, note, and script against the same live target
- edits are preview-only until promoted
- undo/redo/history are strong enough to trust
- provenance is always visible
- provenance is layered so system coherence does not require social overexposure
- every object has deep links into source, runtime, routes, capabilities, and governance
- the same engine works in browser, TUI, and VS Code
- teams can define their own F3/F4/F5 operator workbenches

That is the future-state story:

- we replaced screen-sharing and guesswork with shared structured state

---

## 3. Product Outcomes

The end state should deliver six product outcomes.

### 3.1 Shared Structured State

Users collaborate on the same modeled world, not on screenshots, tabs, or verbal descriptions.

### 3.2 Multiple Native Workstyles

The system must feel first-class for:

- visual operators in the browser
- keyboard-first operators in a TUI
- source-first operators in VS Code

### 3.3 Reversible Live Editing

Users must be able to inspect and change live systems with:

- preview-only mutation
- dry run
- undo/redo
- history
- provenance
- humane visibility and authority boundaries

### 3.4 Full-Platform Coherence

Every meaningful part of the platform must have some representation in the operator environment:

- contexts
- identities
- sessions
- routes
- surfaces
- collections
- processes
- capabilities
- boundaries
- policies
- projections
- authored sources
- diagnostics
- plugins
- packages
- proposals
- branches/change sets/candidate snapshots as platform work matures

### 3.5 User-Defined Operator Workbenches

The biggest long-term leverage comes when teams can build simple custom workbenches over the same engine.

### 3.6 Continuous Execution Integrity

The platform must be able to run continuously, recover cleanly, and rejoin the wider network without corruption.

That means:

- long-lived runtime work is supervised
- memory, handles, queues, and caches are bounded
- restart and rehydration are first-class
- sync and reconciliation are idempotent
- failures degrade locally instead of cascading
- runtime drift becomes visible before it becomes fatal

---

## 4. Product Principles

### 4.1 Engine First

Do not build browser logic, TUI logic, and VS Code logic as separate products.

Build:

- one command/session engine
- one world graph service
- multiple clients

### 4.2 Represent Everything

Every important area of the platform must have some representation.

If something is real in the platform, it should be inspectable somewhere in the operator environment.

Represented does not mean flattened into one visual style or one canonical artifact.

It means:

- the thing can be addressed
- its status can be understood
- its relation to other things can be navigated
- its mutation paths can be surfaced

### 4.3 Deep Link Everything

Every inspectable thing should expose stable deep links where meaningful:

- object
- context
- route
- source location
- provenance record
- live session
- preview session
- capability
- process
- policy/governance node

### 4.4 Provenance At Your Fingertips

Users should not need to hunt for where something came from.

Every important object should quickly answer:

- what is this?
- where did it come from?
- who authored it?
- what generated it?
- what runtime is using it?
- what session changed it?
- what source owns it?

Provenance should be layered:

- object provenance: what changed
- causal provenance: what influenced it
- authority provenance: under what permission or policy it happened
- actor provenance: who did it, when policy and context allow that to be exposed

### 4.5 One Modeled World, Many Representations

The same thing may appear as:

- a tree node
- a command target
- a source span
- a runtime object
- a chart layer
- a legend item
- a map node
- a view tile
- a provenance record

Those are not necessarily identical artifacts. They are representations related through explicit identity, mapping, and status.

### 4.6 Proxies, Aliases, And Explicit Mapping

Representation-specific ids are allowed.

That includes:

- DOM ids
- diagram node ids
- TUI handles
- editor references
- session-local aliases such as `a = this`

The requirement is not "one id everywhere."

The requirement is:

- local ids may exist
- proxy ids must map to stable world identities when possible
- when mapping is provisional, ambiguous, or speculative, that status must be visible
- the mapping itself must be inspectable and deep-linkable

### 4.7 Keyboard First, Not Keyboard Only

The browser must stay usable visually.
The system must also feel native to people who prefer:

- command lines
- TUI navigation
- command palettes
- editor-centric workflows

### 4.8 Humane Mutation And Relation Visibility

The system should not confuse "hidden from the current view" with "illegitimate."

Indirect, automated, delegated, and hard-to-follow mutation paths are allowed.

The requirement is:

- mutation paths must be discoverable in relation space
- changes should be explainable after the fact
- users should be able to see what changed, what it touched, and how it propagated
- preview, replay, and history should reduce fear without demanding total transparency in every social context

### 4.9 Collaboration Is Explicit

Observation, shared sessions, and impersonation must be modeled distinctly.

Do not collapse:

- "I can view what you are seeing"
- "I can join your session"
- "I can act with your authority"

### 4.10 Participatory Representations

Groups, teams, DAOs, and other collectives should be able to author diagrams, maps, notes, overlays, proposals, and desired futures.

These are valuable even when they are not direct runtime fact.

Each represented element should be able to declare whether it is:

- bound to a live identity
- a proxy awaiting binding
- a speculative or proposed object
- a social or interpretive annotation

That keeps participatory artifacts first-class without letting them masquerade as unmarked operational truth.

### 4.11 No Product Soup

The whole point of the product direction is to stop the platform from fragmenting into:

- one browser tool
- one platform console
- one debug sidecar
- one editor workflow
- one TUI experiment

All of those must converge on the same runtime model.

### 4.12 Continuous Execution Is Product

The operator environment is only credible if the execution substrate is credible.

The system must be designed to run continuously, stop safely, restart safely, and reconcile with the rest of the network.

That requires:

- explicit lifecycle phases: boot, hydrate, serve, drain, stop
- ownership for every long-lived handle, subscription, task, cache, and timer
- bounded concurrency and cancellation
- no irreplaceable in-memory truth
- rehydration and replay as normal runtime paths
- runtime integrity visible through the same modeled platform

---

## 5. Primary Frontends

There are three primary operator frontends.

### 5.1 Browser

Best at:

- live scene coupling
- selection by direct visual interaction
- immediate preview feedback
- context-sensitive overlays and sidecars

Current proof points already exist in:

- `page.surface`
- Sourcery companion shell
- Engentus debug sidecar
- runtime inspection overlays
- preview-backed editing flows

### 5.2 TUI

Best at:

- keyboard-heavy workflows
- low-latency structured navigation
- remote/headless operation
- session attach and detached inspection modes

The TUI should not be a separate product. It should be a client over the same engine.

### 5.3 VS Code

Best at:

- source-first workflows
- RVM/WTOML/WCSS authorship
- command palette integration
- tree views
- inline provenance and jump-to-source
- working with a terminal beside source

The right choice is a VS Code extension, not a poor man's editor rebuilt from scratch.

---

## 6. Core Product Model

The operator environment should be organized around five core modeled layers.

### 6.1 World Graph Service

Responsible for:

- contexts
- objects
- context-like roots such as environment
- routes
- surfaces
- collections
- processes
- capabilities
- policies
- projections
- identities
- diagnostics
- authored-source mappings
- provenance
- identity/proxy mappings
- status and binding metadata
- representations

### 6.2 Session Service

Responsible for:

- session identity
- attached versus detached mode
- current selection
- local aliases such as `a = this`
- history
- undo/redo state
- preview session association
- collaboration/follow state
- authority and impersonation posture
- local notes and private working context

### 6.3 Command And Operation Engine

Responsible for:

- parsing commands
- resolving `this`, aliases, ids, and paths
- completions and suggestions
- dry run
- preview mutation
- transaction grouping
- notes and mini-programs
- process block execution
- mutation provenance capture

### 6.4 Representation And Linking Layer

Responsible for:

- deep links
- provenance surfaces
- maps
- legends
- charts
- views
- alternate object representations
- binding and ambiguity indicators
- source jump targets

### 6.5 Runtime Integrity Substrate

Responsible for:

- lifecycle phases: boot, hydrate, serve, drain, stop
- task and handle ownership
- cancellation and shutdown semantics
- bounded queues and backpressure
- cache ownership and eviction discipline
- restart-safe rehydration
- sync and reconciliation semantics
- resource budgets
- leak/race/fault diagnostics

---

## 7. Attached And Detached Modes

This distinction should be first-class across browser, TUI, and VS Code.

### 7.1 Attached Mode

Attached mode means the client is bound to a live debug session.

It inherits:

- current route/surface
- current selection
- local aliases
- preview session
- live history
- live undo/redo
- optional collaborative focus if policy allows

Attached mode is where:

- the browser sidecar shines
- TUI can attach to a live scene
- VS Code can follow live selection

### 7.2 Detached Mode

Detached mode means the client works against the world graph without coupling to a current scene.

Detached mode is useful for:

- structural browsing
- governance work
- notes
- process block authoring
- dry-run planning
- source-first editing without live scene attachment

Detached mode is not a degraded fallback. It is a different working posture.

---

## 8. Command Console And Workbench Model

The browser `F1/F2` concept should become the v1 workbench baseline.

### 8.1 F1: Command/Authorship Console

This is terminal-like, but not a literal terminal emulator.

It should provide:

- command prompt
- structured inspect/edit flow
- completions with `Tab`
- suggestion navigation with `Up/Down`
- type-aware value editors
- history
- dry run
- preview apply
- undo/redo

`this` means the current selected object from the base debug view or active session.

Session-local aliases should work like:

```text
a = this
inspect a
set a fill "#22c55e"
```

### 8.2 F2: World Tree

This is a keyboard-first tree over:

- contexts
- environment
- surfaces
- processes
- identities
- notes
- mini-programs

Keys:

- `Up/Down` move
- `Left/Right` collapse/expand
- `Enter` select/focus
- selection returns to F1 with the chosen target

F2 must navigate stable ids underneath, while letting humans operate through local aliases and readable labels.

### 8.3 Future F3/F4/F5 Workbenches

Users and teams should be able to define specialized workbenches over the same engine.

Examples:

- process runner
- chart tuning console
- authority/governance inspector
- package/plugin provenance browser
- route/surface topology explorer

This is how the system scales without becoming a universal hard-coded UI.

---

## 9. Authorship Modes

The product must support multiple authorship modes over the same modeled system.

### 9.1 Object Editing

Direct target/property/meta editing through typed commands and structured widgets.

### 9.2 RVM Authorship

Users should be able to edit targets through their RVM representation where that is the authored truth.

### 9.3 WTOML Authorship

Users should be able to edit targets through their WTOML representation where that is the authored truth.

### 9.4 WCSS Authorship

WCSS should be inspectable and eventually authorable through the same session-aware preview mechanisms.

All authorship modes should preserve explicit mapping back to world identity, source provenance, and status.

### 9.5 Process Blocks

Users should be able to author command sequences or operator mini-programs with:

- dry run
- preview execution
- grouped undo

### 9.6 JS Visibility Without JS Mutation

Generated or runtime JS should be visible as a representation, but not an editable primary authorship lane in v1.

---

## 10. Undo, Redo, History, And Replay

This must be one of the strongest parts of the product.

Every operation should carry:

- command text
- resolved target
- before/after
- provenance
- session id
- preview revision
- transaction id
- visibility and authority posture where relevant

History should support:

- search
- replay
- named mini-program extraction
- grouped undo
- grouped redo

If the undo/redo/history model is weak, the product will not be trusted for live editing.

---

## 11. Continuous Execution And Runtime Integrity

This must be treated as a product pillar, not a backend cleanup task.

The platform should be able to run 24/7, stop without corruption, recover without drama, and sync back into the wider network when interrupted.

### 11.1 Supervision And Ownership

Every long-lived runtime concern needs an explicit owner.

That includes:

- timers and intervals
- event subscriptions
- sockets and streams
- file/watch handles
- database connections
- bridge channels
- background tasks
- caches
- retry loops

If a resource has no owner, it will leak.
If it has multiple ambient owners, it will race.
If it cannot be shut down cleanly, it is not production-grade.

### 11.2 Crash-Friendly Restart And Rejoin

The system should assume interruption is normal.

That means:

- runtime state can be reconstructed or rehydrated
- persisted intent/state boundaries are explicit
- sync and reconciliation are idempotent
- no essential truth lives only in process memory
- restart paths are exercised, not theoretical

### 11.3 Bounded Concurrency

Parallel development tends to create duplicate workers, hidden polling, accidental fan-out, and stacked retries.

The platform should impose:

- explicit writer/coordination rules per domain
- bounded queues
- cancellation propagation
- no fire-and-forget work without supervision
- no hidden global mutation paths

### 11.4 Resource Budgets

Every meaningful subsystem should have operating budgets.

At minimum:

- memory budget
- handle budget
- queue budget
- cache budget
- latency budget
- retry budget

Budgets should be measured and surfaced through the platform model.

### 11.5 Runtime Self-Inspection

The system should be able to answer:

- what is running?
- who or what started it?
- what resources does it own?
- what is blocked?
- what is retrying?
- what has grown over time?
- what changed since boot?
- what would be cleaned up on shutdown?

This should become part of the operator environment rather than an external afterthought.

### 11.6 AI-Safe Runtime Contribution Constraints

Parallel AI development increases the risk of local cleverness and global fragility.

The platform should standardize:

- lifecycle primitives
- task registries
- cancellation patterns
- sync/reconciliation interfaces
- cache ownership rules
- soak/leak/restart test harnesses

Long-lived runtime code should be harder to improvise than short-lived feature code.

---

## 12. Collaboration, Presence, And Impersonation

The product should support collaboration at increasing levels of power.

### 12.1 Observation

Allowed users can see:

- what another person is focused on
- what session they are in
- what route/surface they are attached to

Observation should be policy-shaped, not assumed universal visibility.

### 12.2 Shared Session

Allowed users can join a shared operator session and collaborate over:

- selection
- notes
- preview mutations
- command history

### 12.3 Authority And Impersonation

Allowed users can assume alternate authority or perspective through governed flows.

This must be modeled explicitly against the existing authority/session infrastructure rather than hidden as an ambient superpower.

The system should be able to separate:

- seeing an effect
- seeing a path
- seeing an actor
- acting with authority

---

## 13. Source Control And Multi-Developer Awareness

The operator environment must become aware that multiple developers exist and are working on shared artifacts.

This should eventually include:

- branch/change-set awareness
- current authored overlay versus baseline awareness
- who changed what
- what preview session owns a change
- what proposal/change-set a mutation belongs to
- whether another user is working in the same area
- when a representation is personal, shared, speculative, or operational

This product direction should converge with platform self-modeling rather than growing a separate source-control sidebar with no world model.

---

## 14. Maps, Legends, Charts, Views, And Representations

The platform already proves that alternate representations matter.

The product direction should make representations first-class at every level.

Examples:

- chart surface
- route graph
- context tree
- capability dependency map
- provenance graph
- package/plugin trust legend
- process execution timeline
- branch/change-set graph
- authority/ownership map

Representations may be:

- operational
- proxy-bound
- speculative
- social

That status should be obvious in the UI, in deep links, and in APIs.

Every representation should answer:

- what identity does this represent?
- what status does this representation have?
- is this directly bound, proxy-bound, or unbound?
- what is the legend?
- how do I jump to source?
- how do I jump to runtime object?
- how do I jump to provenance?

---

## 15. Deep Links

Deep linking is not a convenience feature. It is coherence infrastructure.

Every important modeled thing should support some stable address shape.

Deep links should be able to address:

- stable world identity
- representation proxy
- bound relationship between the two
- session-specific local context where appropriate

Candidate deep-link classes:

- session link
- target/object link
- context link
- route/surface link
- source file plus line
- preview session link
- provenance link
- chart/layer/legend link
- policy/governance link
- note/mini-program link

The product should make "send me the thing" mean a precise identity, not a screenshot or a spoken path.

---

## 16. Current State Assessment

The platform already contains many of the primitives needed for this direction, but they are distributed.

### 16.1 What Exists Now

- `page.surface` is the main native live application runtime surface
- session services and authority modeling already exist
- preview-backed editing already exists in WCSS and app preview-session flows
- Sourcery companion shell already exists as a live companion surface
- Engentus debug sidecar already proves:
  - sidecar route
  - shared debug/preview session ids
  - browser bridge
  - live snapshots
  - structured DOM
  - target selection
  - property-first editing concepts
- platform self-modeling work already exists in `plugin.platform`
- provenance already exists in multiple package/plugin/runtime forms
- route/surface/process/capability runtime modeling already exists

### 16.2 What Is Partially There

- native live inspection is present, but not yet unified as a command engine
- preview editing exists, but not yet as a general operator mutation substrate
- browser-side debug UI exists, but not yet as an engine-backed multi-client product
- platform self-modeling exists, but not yet fully unified with operator sessions
- collaboration primitives exist in authority/session form, but not yet as shared operator presence
- some representations still lack explicit proxy/binding/status metadata, which makes ambiguity feel worse than it should

### 16.3 What Is Missing

- a first-class session object for operator work
- shared command engine
- alias/local-variable model
- TUI client
- VS Code extension
- first-class workbench/plugin contract for F3/F4/F5-style tools
- unified deep-link contract
- ubiquitous provenance-at-point-of-use
- source-control/change-set awareness inside the operator environment
- explicit representation status and binding semantics across the platform
- a runtime ownership/supervision model that all long-lived code must use
- restart/rehydration discipline exercised as a normal path
- bounded-resource visibility for leaks, handles, queues, and caches

---

## 17. Platform Representation Matrix

Every area of the platform must have a representation in some way.

### 17.1 Runtime And Application Layer

- routes
- surfaces
- collections
- processes
- projections
- boundaries
- policies
- capabilities
- runtime diagnostics

### 17.2 Authorship Layer

- RVM
- WTOML
- WCSS
- generated JS as inspect-only
- package/plugin manifests

### 17.3 Operator Layer

- sessions
- preview sessions
- command history
- notes
- mini-programs
- process blocks
- workbench definitions

### 17.4 Collaboration Layer

- participants
- focus/selection
- follow mode
- impersonation posture
- ownership and contention signals
- visibility posture and disclosure boundaries

### 17.5 Execution Integrity Layer

- task owners
- handle registries
- queue state
- cache state
- retry state
- resource budgets
- restart/rehydration state
- reconciliation status
- fault and leak diagnostics

### 17.6 Platform Self-Model Layer

- docs
- gaps
- proposals
- branches
- change sets
- candidate snapshots
- tests
- verification artifacts
- telemetry

If any of these remain unrepresented, the product will fragment.

---

## 18. Proposed Product Shape

The product should be framed as:

- Collaborative Operator Environment

Subheading:

- A modern mainframe for live applications

Core promise:

- inspect, navigate, edit, note, script, preview, collaborate, and trace provenance across the whole platform through one modeled engine
- do so in a way that keeps identity, status, authority, and participation explicit
- keep the live system continuously runnable through explicit execution discipline

Primary surfaces:

- Browser live sidecar
- TUI client
- VS Code extension

Shared substrate:

- world graph service
- session service
- command and operation engine
- representation and deep-link layer
- runtime integrity substrate

---

## 19. Path To A Real Product

The path should move in deliberate layers.

### 19.1 Layer 1: Runtime Integrity Foundation

Build:

- lifecycle model for long-lived runtime work
- task and handle ownership registry
- cancellation and shutdown semantics
- restart/rehydration pathways
- sync/reconciliation contracts
- leak/handle/queue/cache instrumentation

This is the floor for trustworthy 24/7 operation.

### 19.2 Layer 2: Engine Consolidation

Build:

- session object for operator work
- command execution model
- alias/`this` resolution
- undo/redo/history model
- deep-link primitives

This is the foundation for all clients.

### 19.3 Layer 3: Browser Operator Surface

Turn the current sidecar direction into the first real operator client.

Deliver:

- F1/F2 browser workbenches
- typed value editing
- notes
- mini-programs
- browser deep links
- provenance panel
- representation status and binding indicators

### 19.4 Layer 4: Attached And Detached TUI

Deliver:

- attach to live session
- detached graph mode
- tree navigation
- command mode
- history and replay

### 19.5 Layer 5: VS Code Client

Deliver:

- session attach
- object/context tree
- command palette integration
- jump-to-RVM/WTOML/WCSS
- preview-aware authored editing
- notes and process blocks

### 19.6 Layer 6: Collaboration And Presence

Deliver:

- observe another session
- shared session collaboration
- explicit follow mode
- authority-aware impersonation
- layered visibility and disclosure controls

### 19.7 Layer 7: Platform Convergence

Deliver:

- platform self-model nodes accessible through the same operator environment
- source-control/change-set awareness
- verification/test/proposal surfaces
- governance and authority views
- participatory maps and diagrams with explicit binding/status

### 19.8 Layer 8: User-Defined Workbenches

Deliver:

- workbench definition model
- custom F-key slots
- custom command packs
- custom tree/inspector layouts over the same engine

---

## 20. Risks

### 20.1 Rebuilding Too Much UI

Do not build a custom pseudo-editor when VS Code already exists.

### 20.2 Parallel Truths

Do not let browser, TUI, and VS Code each invent their own session and mutation logic.

Do not let participatory artifacts silently masquerade as runtime fact, or runtime fact lose its social context.

### 20.3 Weak Undo/Redo

If undo/redo/history are weak, users will not trust live editing.

### 20.4 Collaboration Without Governance

If presence and impersonation are not explicit, the product becomes unsafe.

### 20.5 Representation Gaps

If major platform areas remain invisible, the operator environment will feel partial and untrustworthy.

### 20.6 Product Soup

If this becomes "Sourcery plus sidecar plus platform console plus editor plugin plus TUI" without shared engine discipline, the platform will fragment.

### 20.7 Runtime Fragility Behind A Strong UX

If the execution substrate keeps leaking, racing, or accumulating orphaned work, the operator environment becomes a polished control panel for an unstable system.

### 20.8 AI-Era Runtime Drift

If long-lived runtime code can be changed without shared lifecycle, supervision, and recovery rules, parallel development will keep reintroducing memory leaks, open handles, and race conditions.

---

## 21. Decisions Locked By This Direction

- build engine first
- browser, TUI, and VS Code are the primary clients
- choose VS Code extension over a custom poor man's editor
- model attached versus detached sessions explicitly
- support local aliases such as `a = this`
- keep JS inspectable but not primary-authorable in v1
- require deep links and provenance as baseline capabilities
- require explicit status and mapping for proxies, aliases, and participatory representations
- require every major platform area to gain representation over time
- require runtime ownership, restart safety, and bounded resource discipline as platform law

---

## 22. What Comes Next

This document is the umbrella direction, not the execution plan.

The next step should be to break it into:

- chapters
- tranches
- tasks

The natural chapter boundaries are:

1. runtime integrity and continuous execution
2. engine and session model
3. browser operator client
4. TUI client
5. VS Code client
6. collaboration and authority
7. provenance and deep links
8. platform convergence and source-control awareness
9. user-defined workbenches

That breakdown should preserve one invariant:

- every tranche must strengthen coherence across the whole platform, not add another isolated tool
- every tranche must improve both human coherence and runtime integrity
