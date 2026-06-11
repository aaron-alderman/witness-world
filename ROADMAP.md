# Roadmap

## North Star

A reflective application environment where memory is executable, witnessed, composable, and navigable — supporting self-editing UI, live process upgrades, witness-first state, personal and shared projections, clear context boundaries, and source/runtime inspection from the same world model.

---

## Near-term hardening

### Address ASAP: remove architecture cheats from the runtime

- [x] Make sessions first-class runtime concepts tied to the application's identity model so `/api/session` is handled generically rather than through the demo handler set
- [x] Replace the demo-specific `todoServer` runtime model with a generic app/server definition in the DSL so host startup and dispatch are not coupled to one demo domain
- [x] Collapse toward a single generic CLI/runtime entrypoint and retire `src/demo-todo-server.js` as a long-lived architectural surface
- [x] Move demo application behavior out of `startTodoServer` route switches and into witnessed/DSL-described route and process definitions
- [x] Remove demo-specific world/runtime knowledge from generic surfaces such as `world-graph` and host defaults instead of renaming them in place
- [x] Replace the todo-specific `renderList` behavior with DSL-driven row structure and row actions so list rendering is no longer hard-coded in the browser runtime
- [x] Retire legacy composite widget kinds (`TodoForm`, `TodoList`, `Status`, `LoginPanel`, `PrivateNotes`, `WitnessInspector`) instead of keeping them as compatibility shims
- [x] Remove hard-coded frontend failure sinks such as `todo_status` and make status/error targets explicit in the witnessed frontend program

### Browser-runtime tests

- [x] Set up a small DOM execution harness (no full browser automation required)
- [x] Catch generated JS regressions automatically
- [x] Test clicks / forms / rendering without manual browser inspection
- [x] Test World Browser interactions

### Source AST as first-class projection

- [x] Expose parsed DSL docs as AST objects
- [x] Link source lines to AST nodes
- [x] Link AST nodes to witnessed Things / Relations / Processes
- [x] Allow selecting AST nodes from the graph and vice versa

### Process View

- [ ] Add a dedicated Process View separate from the World Graph
- [ ] Show branches, loops, parallel steps, async boundaries
- [ ] Show failure witnesses inline
- [ ] Support process-level replay

### Type / trait model

- [x] Traits as compatibility relations
- [x] Typed process inputs and outputs
- [x] Typed gate failures as witnesses
- [x] Value editor widgets chosen by type / trait

### Live hot-swap without reload

- [x] Live projection swap without page reload
- [x] Version compatibility gates
- [x] Rollback witness
- [x] Migration / fork / block semantics

---

## Medium-term features

### Address in the next few sprints: make the witnessed model executable

- [ ] Make witnessed route definitions executable so HTTP dispatch no longer depends on JS handler registries in `host.js`
- [ ] Deepen the new identity/session layer into fully witnessed identity things, relations, authority, and perspective-aware session processes instead of the current dev-auth host implementation
- [ ] Move `widget.define` defaults and mutation semantics (parent fallback, ordering, generated props, identity policy) out of ad hoc JS and into witnessed process behavior
- [ ] Stop duplicating type compatibility/coercion rules across browser and server runtimes; share one witnessed type-model execution path
- [ ] Move demo-specific projections such as `todoState` behind explicit app/demo boundaries or plugin-style extensions rather than treating them as runtime infrastructure

### Cross-cutting theming

- [ ] Introduce witnessed theme boundaries so shell and product surfaces can carry distinct themes without CSS collisions across runtime boundaries

### Governance and proposal flow

- [ ] Add Proposal Things
- [ ] Add vote / accept / reject flow
- [ ] Add delegated stewardship gates
- [ ] Use proposals for widget edits and todo changes

### Cross-context communication

- [ ] Model frontend → backend, human → human, compiler → runtime, LLM → human as one pattern
- [ ] Context A emits request witness; Context B handles through gate/process; response witness links causally

### Canvas refinements (CANVAS-v2 follow-ups)

- [ ] Selective (non-clobbering) undo — skip compensation for claims whose currently-winning witness is not the undo target
- [ ] Connector bundling for dense duplicate-instance pairs
- [ ] Timeline strip virtualization and memoized prefix projection for large logs
- [ ] Bring perspective layouts into the World Graph view
- [ ] Allow manual override of auto-layout in the World Graph

### ELK.js layout

- [ ] Experiment with ELK.js for graph hierarchy and edge routing when the lightweight layout is insufficient

---

## Long-term direction

### Self-hosted editor

- [ ] The UI should edit the witnessed graph that defines the UI

### Self-hosted compiler / runtime

- [ ] The compiler/runtime should be represented, versioned, witnessed, and eventually able to upgrade itself

### LLM agents as contexts

- [ ] LLMs operate inside perspectives and emit proposals / witnesses, never canonical truth

### Distributed contexts

- [ ] Multiple machines / people exchange witnessed envelopes
- [ ] Authority derived from witnessed chains back to Genesis
