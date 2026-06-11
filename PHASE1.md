# Phase 1: Stable Baseline

## Purpose

This document is the handoff guide for **Phase 1: Stable Baseline**.

It should be read alongside [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md), but it is intentionally narrower.

- `ROADMAP.md` answers: what comes next overall
- `PHASE1.md` answers: what must be made true before the platform can honestly claim a stable baseline

The goal is not to add more features. The goal is to make the current platform internally coherent enough that we can draw a line and say:

- the runtime model means one thing
- the supported execution paths are explicit
- the same authored semantics are honored across projections and live execution
- the same identity/session model applies across the public surfaces
- the same type rules apply across browser and server

This is the phase where the project stops being "impressively capable but structurally slippery" and becomes a baseline that later work can safely build on.

---

## Why This Phase Exists

The project has already cleared the obvious near-term architecture cheats:

- generic `serverRunner` + `serve`
- generic session endpoints on the main app path
- live projection swap
- process view
- source AST / world graph / process graph inspection
- test coverage across unit, integration, and browser paths

What remains is more dangerous because it is easier to miss.

The current tree contains several places where the architecture **looks** more unified than it really is:

1. **Process semantics are richer in projection than in runtime execution.**
   - Authored graph semantics exist in [src/process-graph.js](C:\Users\aaron\Documents\world\src\process-graph.js:76).
   - The real browser runtime in [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js:1361) still executes a simpler step runner and does not honor full repeat semantics.
   - Process View can therefore render behavior the runtime does not honor.

2. **Identity/session is generic on the main app, but not across all public surfaces.**
   - Generic host session logic now lives in [src/host.js](C:\Users\aaron\Documents\world\src\host.js:424).
   - Canvas still uses raw actor headers in [src/canvas-page.js](C:\Users\aaron\Documents\world\src\canvas-page.js:91).
   - That means the project still has more than one session model in practice.

3. **Type execution is duplicated.**
   - Browser-side compatibility/coercion logic lives in [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js:1152).
   - Server-side canonical type validation lives in [src/type-model.js](C:\Users\aaron\Documents\world\src\type-model.js:113).
   - Duplication here is not cosmetic. It is a future drift bug.

4. **Route mounting is declarative, but execution still depends on JS handler registries and demo handler sets.**
   - Registry / app-context selection still exists in [src/host.js](C:\Users\aaron\Documents\world\src\host.js:16) and [src/host.js](C:\Users\aaron\Documents\world\src\host.js:348).
   - Demo behavior still lives behind [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js:10).
   - This may be acceptable, but only if it becomes an explicit boundary rather than an unexamined cheat.

5. **`widget.define` behavior is still hidden in app-specific JS.**
   - Parent fallback, ordering, identity policy, generated props, and validation flow still live in [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js:146).
   - If self-editing is core, this cannot remain a silent implementation detail forever.

---

## Phase Objective

At the end of Phase 1, the project should have:

- one real executable process model
- one real identity/session model
- one real type execution model
- one explicit runtime execution boundary
- one explicit baseline contract with tests proving it

This phase is successful when the runtime is boring in the right ways:

- fewer hidden exceptions
- fewer mirrored implementations
- fewer demo-only escape hatches
- fewer places where the inspection model is ahead of the execution model

---

## Non-Goals

Do not expand scope into these areas during Phase 1:

- proposal/governance flow
- fully witnessed backend execution beyond what is required to define the baseline
- theming system redesign
- distributed runtime / multi-machine exchange
- self-hosting compiler/runtime
- deep canvas UX improvements unrelated to identity/session unification
- broad product redesign

Phase 1 is about stability and coherence, not capability growth.

---

## Workstreams

### 1. Make Frontend Process Execution Real

#### Problem

The authored process model already supports:

- `when`
- `after`
- `repeat.while`
- `repeat.forEach`
- dependency-frontier parallel execution

The model is visible in [src/process-graph.js](C:\Users\aaron\Documents\world\src\process-graph.js:1) and executed generically in [src/process-graph.js](C:\Users\aaron\Documents\world\src\process-graph.js:62).

The browser runtime, however, still executes a simpler engine in [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js:1361):

- `when` is honored
- `after` is honored
- `repeat` is traced but not executed as a first-class runtime behavior

That means the DSL can describe a process that:

- the Process View will render
- tests around graph/projection may accept
- but the actual runtime will not execute correctly

#### Required outcome

Make the browser runtime honor the same authored semantics that the process graph already models.

#### Minimum acceptance

- authored `repeat.forEach` steps execute correctly at runtime
- authored `repeat.while` steps execute correctly at runtime
- tracing reflects actual runtime behavior rather than projected intent
- Process View and runtime behavior no longer diverge semantically

#### Likely implementation direction

- Do not invent a second loop engine.
- Reuse or adapt the existing process-graph execution model from [src/process-graph.js](C:\Users\aaron\Documents\world\src\process-graph.js:62).
- If browser-safe extraction is needed, extract shared execution helpers instead of re-implementing semantics inline in `widgets.js`.

---

### 2. Unify Identity and Session Across Public Surfaces

#### Problem

The main app now uses generic identity-backed session behavior through [src/host.js](C:\Users\aaron\Documents\world\src\host.js:424).

Canvas still uses raw actor selection and request headers in [src/canvas-page.js](C:\Users\aaron\Documents\world\src\canvas-page.js:91).

That is not a harmless special case. It means:

- the project still has more than one session primitive
- identity and perspective are not consistently modeled
- different UIs are implicitly teaching different mental models of the system

#### Required outcome

All public surfaces should resolve identity and session through the same model.

#### Minimum acceptance

- `/`
- `/world`
- `/canvas`

all operate against the same identity/session rules.

#### Specific cleanup targets

- remove raw actor-post or actor-header session flows as normal app behavior
- stop treating actor selection as a first-class session primitive
- make canvas use the same session identity as the rest of the app
- preserve perspective selection where appropriate, but do not confuse perspective choice with identity/authentication

#### Constraint

Do not regress developer ergonomics so badly that basic canvas work becomes impossible. If canvas needs a temporary explicit dev-only affordance, make it clearly dev-only and subordinate to the identity model.

---

### 3. Share One Type Execution Path

#### Problem

The browser runtime contains compatibility and coercion logic in [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js:1152).

The server runtime contains the canonical model in [src/type-model.js](C:\Users\aaron\Documents\world\src\type-model.js:113).

This is exactly the sort of duplication that creates invisible drift:

- browser accepts values server rejects
- browser picks controls that imply rules server does not share
- server changes semantics and browser silently stays behind

#### Required outcome

There should be one meaning for:

- compatibility
- coercion
- validation
- editor selection derived from type/trait metadata

#### Minimum acceptance

- shared compatibility semantics
- shared coercion semantics where feasible
- explicit documented exceptions if any browser-only behavior remains
- tests that prove browser and server agree on representative cases

#### Preferred implementation direction

- extract shared browser-safe type helpers
- keep DOM-specific concerns in the browser
- keep type meaning itself in one place

#### Avoid

Do not solve this by copying more of `type-model.js` into `widgets.js`.

---

### 4. Decide the Runtime Execution Boundary

#### Problem

The system now looks declarative from the outside, but actual execution still depends on:

- handler registries in [src/host.js](C:\Users\aaron\Documents\world\src\host.js:16)
- app-context resolution in [src/host.js](C:\Users\aaron\Documents\world\src\host.js:348)
- demo-specific behavior in [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js:10)

This is the point where teams often go wrong:

- they rename the registry
- add another indirection layer
- tell themselves the system is now generic
- and keep the same architectural cheat

#### Required outcome

Pick one of these two positions and implement it clearly:

1. **Executable witnessed runtime path**
   - Route and process behavior moves further into the witnessed model.

2. **Explicit app/plugin execution boundary**
   - JS handler sets remain, but are treated as deliberate app/plugin modules rather than disguised runtime infrastructure.

#### Important note

Phase 1 does not require fully eliminating JS handlers if that is too large.

It does require stopping the ambiguity.

By the end of Phase 1, a new contributor should be able to answer:

- which behavior is core runtime
- which behavior is app-specific extension
- where the boundary lives
- how it is tested

without hand-waving.

#### Required deliverable

This workstream must end with a short explicit boundary record in code or docs that states:

- what is generic runtime
- what is app/demo/extension behavior
- whether JS handler sets are transitional or intentional
- what future work would be required to move more execution into witnessed definitions

---

### 5. Move `widget.define` Semantics Out of Demo Ad Hoc Logic

#### Problem

`widgets.create` currently bakes real semantics into demo-specific JS in [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js:146):

- parent fallback
- order defaulting
- generated props
- identity policy
- validation ordering
- output shaping

These are not incidental choices. They are platform behavior hiding in demo code.

#### Required outcome

Make `widget.define` behavior explicit and runtime-owned rather than demo-owned.

#### Minimum acceptance

- defaults and mutation semantics are described in one explicit place
- demo code is no longer the authority for projection-edit semantics
- typed validation still works end-to-end
- the chosen policy is documented in tests and handoff docs

#### Important constraint

Do not treat this as a rename or file move exercise.

If the same hidden semantics still live in a slightly more abstract JS helper, Phase 1 has not solved the real problem.

---

### 6. Define the Stable Baseline Contract

#### Problem

Right now "stable baseline" is a judgment call.

That is not good enough for handoff.

#### Required outcome

Write down the baseline contract and prove it with tests.

#### The contract should answer

- what authored process constructs are truly supported
- what session/identity behavior is canonical
- what type execution path is canonical
- what runtime behaviors are generic
- what remains app/plugin-specific by design
- what public routes and surfaces are guaranteed

#### Minimum acceptance

- explicit documentable contract
- tests mapped to each contract area
- no major behavior relying on "everyone just knows how this part works"

#### Recommended artifact

The end state should include one compact baseline contract document or section that a new contributor can use as the authoritative statement of:

- supported authored process semantics
- canonical session/identity behavior
- canonical type behavior
- generic runtime guarantees
- explicit non-goals and known deferred boundaries

---

## Recommended Order of Work

This is the recommended sequence. It reduces the chance of rework.

1. **Process execution**
   - Make the live runtime honor the authored process model.
   - This removes the projection/runtime split first.

2. **Type execution unification**
   - Once process execution is real, make sure both sides mean the same thing for typed inputs/outputs.

3. **Identity/session unification**
   - Bring canvas and any remaining surfaces into the same identity/session model.

4. **Runtime boundary decision**
   - Decide whether route/process behavior is becoming executable in the model, or whether JS handlers remain an explicit extension boundary.

5. **`widget.define` semantics extraction**
   - Once the execution boundary is clear, move widget mutation semantics to the right layer.

6. **Baseline contract + final tests**
   - Lock the resulting shape down explicitly.

---

## Landmines

This project is full of places where people with otherwise sound instincts will make it worse.

These are the main traps.

### Landmine 1: Renaming a cheat instead of removing it

Bad pattern:

- rename a demo-specific or ad hoc layer
- add a registry/factory/adapter around it
- declare it generic

If the runtime still depends on the same hidden authority, nothing important changed.

### Landmine 2: Letting projection get ahead of execution

The project is good at making things visible:

- world graph
- process view
- source annotations

That is useful, but dangerous.

Do not accept a state where the inspection model is richer than the executable model for core semantics.

### Landmine 3: Adding a second "temporary" implementation

This has already happened in places:

- process semantics
- type semantics
- session behavior

The next implementation should converge duplicated logic, not add a third version.

### Landmine 4: Solving identity with a UI convenience

Actor pickers, raw headers, and dev shortcuts are not identity architecture.

They may be acceptable as developer tools, but they must not remain the real mechanism once the identity model exists.

### Landmine 5: Treating demo code as harmless

The demo is not harmless glue. It has historically contained real platform semantics.

Every time a behavior is left in demo JS, ask whether it is:

- truly app-specific
- or a platform rule hiding in the wrong place

### Landmine 6: Expanding scope into future architecture

This phase is not:

- proposals
- self-hosting
- distribution
- theming redesign
- broad live-upgrade runtime

Those are important, but Phase 1 fails if it becomes a detour away from baseline coherence.

---

## Implementation Guidance

### Do

- Work from the current code, not the intended architecture in someone's head.
- Use the codebase as evidence and keep the roadmap/handoff docs honest.
- Prefer convergence over indirection.
- Extract shared execution logic when two runtimes currently implement the same semantics.
- Preserve current public routes and recognizable behavior unless a change is required to remove a structural contradiction.
- Add tests that prove real execution, not just projection shape.
- Make boundary decisions explicit in code and docs.
- Keep generic runtime behavior and app-specific behavior clearly separated.
- Tighten one core contract at a time and verify it end-to-end.

### Do Not

- Do not "genericize" by renaming files or objects while keeping the same hidden authority.
- Do not add compatibility shims that preserve contradictory runtime models indefinitely.
- Do not deepen demo-owned JS as a place to hide platform semantics.
- Do not make Process View more sophisticated as a substitute for fixing runtime execution.
- Do not duplicate server logic into the browser again.
- Do not keep raw actor/session escape hatches as if they are neutral implementation details.
- Do not declare support for authored semantics that the runtime does not actually execute.
- Do not rely on green tests if the tests only prove projection output or static structure.
- Do not expand Phase 1 into a redesign of everything else.

### What Good Looks Like

By the end of this phase, a contributor should be able to inspect the current codebase and answer, without oral history:

- how a frontend process actually executes
- how session identity is established and resolved
- where type meaning lives
- which runtime behavior is truly generic
- which behavior is still app-specific by deliberate choice
- what the platform claims to support right now

---

## Verification Expectations

The phase should end with targeted evidence, not just code changes.

### Unit

- process runtime semantics match authored graph semantics
- shared type compatibility/coercion behavior is exercised directly
- session resolution rules are tested independently of UI
- widget mutation defaults/semantics are tested at their new authority layer

### Integration

- authored frontend processes execute with real `when`, `after`, `repeat.while`, and `repeat.forEach`
- `/`, `/world`, and `/canvas` agree on the same identity/session model
- route/handler execution boundary is exercised the same way the architecture claims it works

### Browser

- UI flows still work without reintroducing local cheats
- canvas no longer depends on raw actor-post or raw actor-header session behavior
- process tracing matches actual runtime behavior

### Contract

- stable baseline support is written down explicitly
- tests point at that contract

---

## Definition of Done

Phase 1 is done only when all of these are true:

- frontend process execution and process projection describe the same core semantics
- identity/session behavior is unified across the public surfaces
- browser and server no longer carry independent type meaning
- the route/process execution boundary is explicit and defensible
- `widget.define` semantics are no longer hidden in demo ad hoc logic
- the stable baseline contract is documented
- the tests prove the contract rather than only incidental behavior

If any of those remain fuzzy, Phase 1 is not done.

---

## Final Note for Handoff

The right way to think about this phase is:

> remove contradictions before adding more power

The wrong way to think about it is:

> keep shipping features and trust that the architecture will converge later

This codebase is already capable enough to fool people into believing it is more unified than it is. The main job of Phase 1 is to remove that illusion.
