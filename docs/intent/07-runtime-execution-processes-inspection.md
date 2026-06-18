# 07 - Runtime Execution, Processes & Inspection

## Role in Primary Intent

Behavior is expressed as explicit, inspectable processes. Execution produces witnesses. All surfaces (UI, inspectors, canvas, world browser) are projections or live views over the same model. The user can always see what is happening and what happened.

## Core Desires / Intents

### 7.1 Explicit process model with rules, state, messages, commands, effects
**Defined in:**
- DESIRE kernel `process` kind (category 03)
- [../DESIRE.md](../DESIRE.md) (process form, rules, effects including assign/read/create/update/emit/guard/call/branch/propose/fail)
- [../experiment/new-desire/DESIRE-KERNEL.md](../experiment/new-desire/DESIRE-KERNEL.md)

**Enacted:**
- [../../src/desire/process-eval.js](../../src/desire/process-eval.js): generic engine (`createProcessRuntime`, state seeding, dispatch for commands, deliver for events/messages).
- Rules are data: `(rule (on Trigger) Effect*)`
- Used for both frontend and (increasingly) backend programs.

### 7.2 Execution traces, graphs, replay, and settlement
**Enacted:**
- [../../src/runtime-execution-runner.js](../../src/runtime-execution-runner.js)
- [../../src/process-graph.js](../../src/process-graph.js)
- Task tracking, when-settled, idle detection, failure boundaries.
- Process view page and replay surfaces.

### 7.3 First-class transparent inspection surfaces
World graph, thing list, primitive browser, source browser, process view, witness inspector, live inspector, canvas.

**Enacted primarily in:**
- [../../plugins/inspect/](../../plugins/inspect/) (large surface):
  - world-graph-*.js, world-browser-view.js
  - process-view.js, surface-inspector-*, surface-command-*
  - widget-versions.js, widget-page.js
- Canvas inspection and interaction: [../../plugins/canvas/](../../plugins/canvas/)
- Runtime surface diagnostics and honesty layer (recent additions for issue ledger).

### 7.4 Canvas as a spatial, object-oriented, undo/redo-first composition and execution surface
**Defined:**
- [../CANVAS.md](../CANVAS.md) (Architectural Principles: Undo/Redo First, Serialization First, Everything Is an Object, PowerPoint mental model + world objects).

**Enacted:**
- [../../plugins/canvas/](../../plugins/canvas/) (core, gesture, history, interaction, io, render, session, sync, undo, toolbar, etc.)
- Lives alongside (and can host) other surfaces such as the embedded Todo board in Eden.

### 7.5 Live evolution (versioned artifacts + activate/rollback) under governance
**Enacted:**
- Widget versions and Eden versions proposal paths.
- Live inspector version actions.
- Changes flow through the shared proposal model then witness refresh.

## Key Files

| Concern                  | Implementation                                                                 |
|--------------------------|--------------------------------------------------------------------------------|
| Generic process engine   | src/desire/process-eval.js                                                     |
| Execution runner         | src/runtime-execution-runner.js                                                |
| Graphs & traces          | src/process-graph.js                                                           |
| Inspect surfaces         | plugins/inspect/* (graph, browser, process-view, inspectors, widget-versions) |
| Canvas                   | plugins/canvas/*                                                               |
| Runtime surface host     | src/runtime-surface-*.js (page, dom-host, inspector-primitives, etc.)          |
| Diagnostics / honesty    | src/runtime-surface-diagnostics.js + engentus-dev-diagnostics plugin           |

## Honesty & Status
- Core execution of authored frontend processes + traces: real.
- Backend process parity and deeper shared higher-level flow patterns: still partial.
- Live inspector + version governance on canonical seams: real but narrow slices expanding.
- Inspection is one of the strongest current areas (world + process + canvas).

## Cross References
- Powered by: 02 (witness substrate), 03 (DESIRE process/surface nodes), 06 (authority for mutations during live ops)
- Used by: 08 (Sourcery explains real execution state), 09 (surfaces are the rendered form of this), 11 (platform console inspects its own runtime)
- See also [../CAPABILITIES.md](../CAPABILITIES.md#3-runtime-execution-and-inspection)

## Related Documentation
- [../CANVAS.md](../CANVAS.md)
- [../CAPABILITIES.md](../CAPABILITIES.md#3-runtime-execution-and-inspection) and 3.2/3.3
- Process view and world browser are core product surfaces described in the top-level README.
