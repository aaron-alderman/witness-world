# Roadmap

## North Star

A reflective application environment where memory is executable, witnessed, composable, and navigable.

The system should eventually support:

- self-editing UI
- live process/widget upgrades
- witness-first state
- personal and shared projections
- clear context boundaries
- explicit frontend/backend/LLM/human capabilities
- source and runtime inspection from the same world model

## Near-term hardening

### 1. Browser-runtime tests

Move beyond string/syntax tests into a small DOM execution harness.

Goals:

- catch generated JS regressions
- test clicks/forms/rendering without manual browser inspection
- test World Browser interactions

### 2. Source AST as first-class projection

Current source view is file text plus heuristic highlighting.

Next:

- expose parsed DSL docs as AST objects
- link source lines to AST nodes
- link AST nodes to witnessed things/relations/processes
- allow selecting AST nodes from graph and vice versa

### 3. Process View

The World Graph is now intentionally a context/relationship view.

Add a separate Process View for:

- branches
- loops
- parallel steps
- async boundaries
- failure witnesses
- process-level replay

### 4. Better type/trait model

Typed value widgets exist, but semantic types are still immature.

Next:

- traits as compatibility relations
- typed process inputs/outputs
- typed gate failures as witnesses
- value editor widgets chosen by type/trait

### 5. Live hot-swap without reload

Widget activation currently reloads the page for simplicity.

Next:

- live projection swap
- version compatibility gates
- rollback witness
- migration/fork/block semantics

## Medium-term features

### Governance and proposal flow

- Add Proposal objects
- Add vote/accept/reject flow
- Add delegated stewardship gates
- Use proposals for widget edits and todo changes

### Personal projection layout

Started in 0.32.0: `/canvas` stores view-local positions on `projectionInstance` proxies owned by witnessed Perspectives. 0.33.0 added editor ergonomics (multi-select, atomic group moves, resize, witnessed snap-to-grid, duplicate placement). 0.34.0 added the browser-side outbox: small changes coalesce client-side and land as one `canvas.batch` witness per debounce window (which will be one undo step in the undo phase).

- Store view-local graph positions on personal proxies (done for /canvas)
- Allow manual override of auto-layout
- Keep shared canonical graph separate from personal layout
- Bring perspective layouts into the World Graph view
- CANVAS-v2 phase 3 (preferences recorded): witness timeline scrubbing over all witnesses with a canvas-filtered event strip; witness-aware undo scoped to the actor's last action in the current perspective; later, animation as witness playback
- Canvas follow-ups: `canvas.styleMany` for one-witness bulk styling, group resize, connector bundling for dense duplicate pairs

### Cross-context communication

Model frontend → backend, human → human, compiler → runtime, LLM → human as the same communication pattern:

```text
Context A emits request witness
Context B handles through gate/process
Response witness links causally
```

### ELK.js layout experiment

The current layout is deterministic and lightweight.

Try ELK.js when the graph needs clearer hierarchy and edge routing.

## Long-term direction

### Self-hosted editor

The UI should edit the witnessed graph that defines the UI.

### Self-hosted compiler/runtime

The compiler/runtime should be represented, versioned, witnessed, and eventually able to upgrade itself.

### LLM agents as contexts

LLMs should operate inside perspectives and emit proposals/witnesses, never canonical truth.

### Distributed contexts

Multiple machines/people should exchange witnessed envelopes.

Authority remains derived from witnessed chains back to Genesis.
