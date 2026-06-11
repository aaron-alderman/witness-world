# Roadmap

## North Star

Build a reflective application environment where memory is executable, witnessed, composable, and navigable.

The platform should eventually support:

- self-editing UI and process definitions
- first-class identity, authority, and perspective
- live evolution with safe migration and rollback
- clear product, shell, and extension boundaries
- witnessed execution and inspection across the same world model

This roadmap lists **unfinished work only**. Completed cleanup and earlier cheat-removal passes are intentionally omitted.

---

## Current Position

The project now has a credible runtime spine:

- witnessed state and replayable projections
- declarative routes, widgets, frontend programs, and widget version transitions
- generic host startup through `serverRunner` + `serve`
- identity-backed session handling on the main app path
- live projection refresh without full page reload
- dedicated Process View and generic frontend execution tracing

What is still missing is a stable baseline. The main risk now is not obvious cheats. It is contradictions between what the architecture appears to support and what the runtime actually does.

---

## Phase 1: Stable Baseline

This is the immediate priority. The goal is to reach a point where the runtime is coherent, testable, and explicit about its real boundaries.

- [ ] Make frontend runtime execution honor the full authored process model, not just the projected graph.
- [ ] Support `when`, `after`, `repeat.while`, and `repeat.forEach` in the real browser execution path.
- [ ] Unify identity and session behavior across `/`, `/world`, and `/canvas`.
- [ ] Remove raw actor/session escape hatches as normal app behavior.
- [ ] Share one type compatibility, coercion, and validation path across browser and server.
- [ ] Make the route/handler execution boundary explicit.
- [ ] Decide whether more route/process behavior becomes executable from witnessed definitions or remains an explicit app/plugin boundary in JS.
- [ ] Move `widget.define` defaults and mutation semantics out of demo-owned ad hoc logic.
- [ ] Define and test the stable baseline contract so the supported runtime surface is explicit.

Phase 1 is the line where we should be able to say the platform is no longer papering over core architectural choices.

Related handoff: [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md)

---

## Phase 2: Executable Runtime Model

Once the baseline is stable, the next step is to reduce how much of the platform is merely declarative-looking versus actually executable from the model.

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

