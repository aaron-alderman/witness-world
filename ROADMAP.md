# Roadmap

## North Star

Build a reflective application environment where memory is executable, witnessed, composable, and navigable.

The platform should eventually support:

- self-editing UI and process definitions
- first-class identity, authority, and perspective
- live evolution with safe migration and rollback
- clear product, shell, and extension boundaries
- witnessed execution and inspection across the same world model

This roadmap tracks the current path forward. Recent work that directly changes the active baseline should be marked explicitly so progress and remaining gaps stay visible.

Related direction:

- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md)

---

## Experience Thesis

The project is not only trying to prove a runtime. It is trying to become a truthful composition environment.

That broader product direction currently looks like:

- Sourcery as a truthful companion rather than a fake wizard
- plugins/capabilities as first-class, inspectable "glass atoms"
- contexts as the boundary for names, authority, and local composition
- pages that are inspectable and increasingly editable in place
- code, canvas, builders, and inspectors as different expressions over one world
- desktop, browser, and hosted shells over the same core model

The straight-line Todo/bootstrap work remains useful, but it is only one proving path through this larger shape.

---

## Current Position

The project now has a credible runtime spine:

- witnessed state and replayable projections
- declarative routes, widgets, frontend programs, and widget version transitions
- generic host startup through `serverRunner` + `serve`
- identity-backed session handling on the main app path
- live projection refresh without full page reload
- dedicated Process View and generic frontend execution tracing
- a bootstrap seam that can recover a blank world into a runnable app
- a guided tutorial that teaches real app assembly through that seam

Phase 1 has established most of the runtime baseline:

- one real executable frontend process model
- one canonical identity/session model across the public browser surfaces
- one shared type execution path across browser and server
- one explicit app/plugin execution boundary for runtime behavior
- one explicit baseline contract with tests mapped to the supported surface
- one blank-world bootstrap seam that can recover into a runnable app
- one browser-proven path that recreates the todo app purely through the UI against the current runtime boundary

---

## Phase 1: Stable Baseline

Status: complete

This phase is about reaching the point where the runtime is coherent, testable, explicit about its real boundaries, and authorable enough from inside the product to recreate the baseline demo without dropping back to source files.

- [x] Make frontend runtime execution honor the full authored process model, not just the projected graph.
- [x] Support `when`, `after`, `repeat.while`, and `repeat.forEach` in the real browser execution path.
- [x] Unify identity and session behavior across `/`, `/world`, and `/canvas`.
- [x] Remove raw actor/session escape hatches as normal app behavior.
- [x] Replace the `/canvas` actor selector with the same session-backed login/logout model used by the main app, keeping any raw actor path dev-only.
- [x] Share one type compatibility, coercion, and validation path across browser and server.
- [x] Extract browser-safe shared type helpers from the type model so browser form coercion and validation stop re-implementing server semantics.
- [x] Make the route/handler execution boundary explicit.
- [x] Decide whether more route/process behavior becomes executable from witnessed definitions or remains an explicit app/plugin boundary in JS.
- [x] Move `widget.define` defaults and mutation semantics out of demo-owned ad hoc logic.
- [x] Define and test the stable baseline contract so the supported runtime surface is explicit.
- [x] Make it possible to start from a blank world and recreate the todo app purely through the UI.
- [x] Add a blank-world bootstrap editing shell so the product is usable before any app routes have been authored.
- [x] Keep that bootstrap shell in a semi-internal seam: hidden by default, easy to reveal, and clearly separate from normal app content.
- [x] Provide first-class UI authoring for the missing baseline structures: identities, widgets, frontend programs, routes, `serve` mounts, and `serverRunner` runtime wiring.
- [x] Make those authoring flows compose through projected references and supported handler selection rather than brittle copied ids.
- [x] Keep the current explicit app/plugin handler boundary, but make it selectable and wireable through the UI for baseline app assembly.
- [x] Keep compiler/primitives and deep runtime machinery hidden by default so the default authoring surface stays focused on "your app" rather than substrate.
- [x] Prove the blank-to-todo flow with an end-to-end test rather than manual source edits.

Phase 1 now means the platform can honestly say it is no longer papering over core architectural choices at the baseline layer and the demo can be rebuilt from inside the product rather than by editing WTOML by hand.

For this phase, "purely through the UI" means wiring the app from a blank world against the existing runtime and explicit handler/plugin boundary. It does not require authoring new backend JS handler implementations in-product.

Related handoffs:

- [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md)
- [BASELINE.md](C:\Users\aaron\Documents\world\BASELINE.md)

---

## Post-Phase-1 Learning Surface

Status: active

Phase 1 is complete, but the platform still needs a clear way to teach the real assembly surface without exposing compiler/primitives as the default user experience.

- [x] Add a dedicated `/_bootstrap` seam that is hidden by default but intentionally reachable.
- [x] Keep raw typed builders visible so the tutorial uses the real product surface rather than a fake wizard.
- [x] Add a guided Todo tutorial that pre-fills and highlights the real forms, waits for real submissions, and continues onto `/` for live app usage.
- [x] Persist tutorial progress locally before auth and in the session after auth.
- [x] Make tutorial resume survive seam transitions between `/_bootstrap` and `/`.
- [ ] Generalize the tutorial system beyond the Todo tutorial once the next authoring milestones settle.
- [ ] Add console-owned account recovery for persisted worlds, including an explicit password-reset path that does not depend on the browser UI.

This learning surface is distinct from bootstrap recovery, normal app usage, and deeper self-hosting. It exists to teach the real app boundary honestly.

---

## Cross-Cutting Track: Sourcery and Composition Experience

Status: active

This track is intentionally wider than the baseline Todo/tutorial flow. It captures the experience work needed so the product teaches composition honestly without hiding the machine.

- [ ] Evolve Sourcery from a guided Todo tutorial into a contextual companion that can operate at world, page, section, and widget scope.
- [ ] Let the user restart guidance from the beginning of the relevant scope: widget, section, page, chapter, or full first-run path.
- [ ] Allow Sourcery to be disabled per context while remaining discoverable and re-enableable from a central view.
- [ ] Introduce a first-class contextual plugin/capability model where installed capabilities expose public API, configuration surface, internals, context, and authority requirements.
- [ ] Make plugin/capability installation feel local to the point of need rather than only a detached setup flow.
- [ ] Continue moving toward editable-everywhere pages with context actions such as inspect, hide, replace, upgrade, and show witnesses/processes.
- [ ] Add a true search/command surface spanning pages, widgets, capabilities, commands, hidden surfaces, and witnessed execution.
- [ ] Add a devtools-like live inspector that can map rendered elements back to authored widgets and save edits into the world.
- [ ] Clarify how the bootstrap seam, normal app pages, and future meta-editor surfaces fit together without becoming contradictory products.
- [ ] Keep the product truthful: curation and guidance may rank, collapse, and explain, but must not hide real modeled structure.

This is the main bridge from the current bootstrap/tutorial work toward a world where users keep building and keep composing rather than graduating out of the product.

---

## Phase 2: Executable Runtime Model

This phase follows once Phase 1's authoring baseline is finished. The next step is to reduce how much of the platform is merely declarative-looking versus actually executable from the model.

- [ ] Make route behavior more directly executable from witnessed/runtime-authored definitions.
- [ ] Extend execution beyond frontend graphs into a more generic witnessed backend/process model.
- [ ] Model cross-context request/response as one witnessed pattern across frontend, backend, compiler, human, and agent contexts.
- [ ] Replace remaining hidden runtime conventions with explicit runtime contracts or extension points.
- [ ] Remove any remaining demo-shaped behavior from generic runtime surfaces.

This phase should deepen execution, not add another layer of registries that only rename existing cheats.

---

## Phase 3: Identity, Authority, and Proposals

Once the runtime boundary is stable, identity and authority need to become fully native to the model rather than thin runtime support.

- [ ] Deepen identity into first-class witnessed things, relations, and perspective-aware authority.
- [ ] Model authority and stewardship explicitly rather than treating runtime permission as an implementation detail.
- [ ] Define operator-owned recovery semantics for identity bootstrap and password reset once warm/persistent worlds are a supported runtime mode.
- [ ] Add proposal things and witnessed propose / accept / reject flows.
- [ ] Use proposals and authority gates for projection edits, widget edits, and application mutations where direct mutation is no longer appropriate.
- [ ] Clarify how personal, shared, and delegated perspectives interact with identity and authority.

This is the point where governance becomes part of the world model rather than sitting beside it.

---

## Phase 4: Live Evolution

The first pass of live widget hot-swap exists. The next phase is safe evolution of running systems.

- [ ] Move from widget subtree refresh toward broader live runtime/process evolution.
- [ ] Strengthen compatibility gates beyond first-pass widget-version transitions.
- [ ] Make migration semantics capable of doing real state/projection transitions where required.
- [ ] Expand rollback and recovery beyond same-soul widget version rollback.
- [ ] Define fork/block/migrate semantics at a broader runtime level where version boundaries affect running systems.

This phase should make live evolution trustworthy rather than merely impressive.

---

## Phase 5: Product, Shell, and Extension Boundaries

The runtime now spans multiple surfaces. Those surfaces still need cleaner separation.

- [ ] Introduce explicit theme boundaries so shell and product surfaces can diverge without CSS conflict.
- [ ] Formalize what belongs to the shell, what belongs to product apps, and what belongs to extensions/plugins.
- [ ] Clarify which projections are generic platform projections and which are app-specific.
- [ ] Make extension/app boundaries visible in both code structure and runtime execution contracts.
- [ ] Define desktop-shell-specific capabilities as explicit capabilities/plugins rather than hidden core behavior.
- [ ] Prove the same world can be owned locally and reached remotely without splitting the model.

This is where theming belongs. It should be deferred until the runtime baseline is coherent, but not ignored indefinitely.

---

## Phase 6: Self-Editing and Self-Hosting

This is the transition from prototype platform to platform that can meaningfully define and evolve itself.

- [ ] Make the UI edit the witnessed graph that defines the UI.
- [ ] Represent compiler/runtime artifacts as witnessed, versioned things inside the same world.
- [ ] Support self-upgrade of the editor/runtime through witnessed proposals, transitions, and rollback.
- [ ] Make core editing, projection, and execution flows operable from within the platform itself.

This phase should only begin once the lower-level execution and authority model is stable enough to trust.

---

## Phase 7: Multi-Context and Distributed Operation

The long-term model should work across more than one machine, one user, or one execution context.

- [ ] Treat agents as perspective-bound contexts that emit proposals and witnesses, never canonical truth.
- [ ] Support witnessed exchange across multiple machines and people.
- [ ] Derive authority from witnessed chains back to genesis across distributed contexts.
- [ ] Clarify replication, merge, and conflict semantics for distributed witnessed worlds.

This is long-range work. It should not distort near-term runtime decisions, but near-term runtime decisions should avoid foreclosing it.

---

## Ongoing but Secondary

These items matter, but they should not take priority over the phase structure above.

### Canvas and Interaction

- [ ] Selective undo that does not clobber later winning claims from other witnesses.
- [ ] Connector bundling for dense duplicate-instance pairs.
- [ ] Timeline strip virtualization and memoized prefix projection for large logs.
- [ ] Bring perspective layouts into the World Graph view.
- [ ] Allow manual override of auto-layout in the World Graph.

### Graph Layout

- [ ] Evaluate stronger layout/routing approaches when the lightweight graph layout stops being adequate.
