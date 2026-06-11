# Roadmap

## North Star

A reflective application environment where memory is executable, witnessed, composable, and navigable — supporting self-editing UI, live process upgrades, witness-first state, personal and shared projections, clear context boundaries, and source/runtime inspection from the same world model.

---

## Near-term hardening

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

- [ ] Live projection swap without page reload
- [ ] Version compatibility gates
- [ ] Rollback witness
- [ ] Migration / fork / block semantics

---

## Medium-term features

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
