# Operator MCP-Only Restart Scope

Status date: `2026-06-21`

This document scopes a clean restart path for the operator workbench using the repo's existing canonical MCP-authoring lane instead of continuing to repair the current host-heavy operator stack.

It is intentionally narrow:

- MCP calls are the only mutation lane.
- RVM expresses the semantic model.
- Presentation is layered separately from semantic content.
- AssemblyScript is used only where measurement proves a rendering hotspot.

---

## 1. Why Restart

The current operator workbench proved several important things:

- cell-based rendering is viable
- a browser-first host can render a TUI-like surface
- shared snapshot/core seams can carry real interaction slices
- RVM/operator authoring can already describe parts of the shell

But the current build also hardened the wrong causality:

- shell/runtime behavior became product semantics
- authoring was added after the fact
- browser/runtime code still fills semantic gaps
- presentation concepts leaked upward into the product model

This makes continued repair expensive and ambiguous.

The restart should treat the current work as:

- proof of viability
- a source of reusable low-level parts
- a reference expectation suite

It should not treat the current operator runtime as the new foundation.

---

## 2. Canonical Direction

The restart should follow the same canonical app-authoring lane already exercised elsewhere in the repo:

- MCP authoring
- authored `page.surface` route output
- proposal-aware governance when direct authority is unavailable
- RVM as semantic model input

The strongest existing proof is the Engentus authoring pathway:

- [`test/engentus-authoring-pathway.test.js`](C:\Users\aaron\Documents\world\test\engentus-authoring-pathway.test.js)
- [`scripts/mcp-authoring-replay-probe.mjs`](C:\Users\aaron\Documents\world\scripts\mcp-authoring-replay-probe.mjs)
- [`examples/engentus/app.wtoml`](C:\Users\aaron\Documents\world\examples\engentus\app.wtoml)

Important evidence already in the repo:

- Engentus installs `plugin.mcp` and `plugin.mcp-authoring`.
- Engentus defines an MCP server and installs `world.read` and `authoring.write`.
- Engentus serves app-owned authored `page.surface` routes.
- The canonical authoring pathway probe already proves interactive authored `page.surface` routing and MCP-authored shell flow.

This is the lane the restart should use.

---

## 3. Core Principles

### 3.1 Semantic model first

- The workbench is a data model, not a file format and not a shell loop.
- RVM is one way to express and persist that model.
- The model is primary; text serialization is secondary.

### 3.2 MCP calls only for mutation

- Model creation, mutation, and structural edits happen through MCP tools only.
- No direct host-side source rewriting as a product-authoring path.
- No hidden side-channel writes from browser or Electron runtime code.

### 3.3 Presentation is not semantics

- Windows, splits, stacks, tabs, overlays, and panes are presentation objects.
- The semantic content shown inside them is a different layer.
- Content identity must not depend on where it is shown.

### 3.4 No defaults

- Missing required structure is a definition error.
- Missing references are errors.
- Runtime must not heal incomplete models by guessing.

### 3.5 Stable identity is internal, labels are external

- Internal ids are stable machine identities.
- Display labels are human-facing and mutable.
- Substitution, references, actions, and links bind to internal ids, not labels.

### 3.6 Traits drive substitution

- Traits are part of the semantic type system.
- Traits decide what can substitute for what.
- Swapability must be determined by semantic compatibility, not by host-specific class names or pane positions.

### 3.7 AssemblyScript only for constrained hot paths

- Semantics, state transitions, authoring, and validation stay in JS/RVM/MCP land.
- AssemblyScript is only justified for tight rendering paths such as:
  - framebuffer writes
  - glyph blitting
  - maybe low-level layout/compositor math if profiling proves it

It is not the place to hide semantics.

---

## 4. What MCP-Only Means Here

For this restart, "MCP-only" should mean:

- all semantic object creation happens via MCP tool calls
- all semantic object edits happen via MCP tool calls
- all binding/layout edits happen via MCP tool calls
- all persisted authored artifacts are emitted through MCP-authoring tools
- read paths use `world.read` or equivalent read-only MCP flows
- when authority is insufficient, the same lane yields proposals instead of bypassing governance

It should not mean:

- "MCP only at bootstrap, then ad hoc runtime mutation later"
- "MCP for some operations, direct source patching for others"
- "MCP for storage, but browser code still invents product semantics"

---

## 5. Model Shape

The restart should separate three model layers.

### 5.1 Semantic/content layer

Examples:

- inspector content
- tree content
- table content
- menu content
- document/source/provenance/reference viewers
- command surface content
- status surface content
- editor content later

Semantic objects should carry:

- stable id
- display label
- kind
- traits
- relations
- actions
- linkable targets
- capability constraints

### 5.2 Presentation layer

Examples:

- window
- split
- stack
- tab-set
- overlay window
- chrome strip
- handle

Presentation objects should carry:

- stable id
- arrangement structure
- focusability rules
- composition relationships
- bindings to semantic content objects

The presentation layer must not redefine semantic content.

### 5.3 Session/runtime layer

Examples:

- focused window
- selected content object
- active tab binding
- overlay open state
- cursor/scroll state
- transient geometry adjustments

Session/runtime state must remain separate from the authored semantic and presentation model.

---

## 6. What To Reuse

Keep and mine these pieces aggressively:

- MCP authoring pathway and probe logic:
  - [`scripts/mcp-authoring-replay-probe.mjs`](C:\Users\aaron\Documents\world\scripts\mcp-authoring-replay-probe.mjs)
  - [`test/engentus-authoring-pathway.test.js`](C:\Users\aaron\Documents\world\test\engentus-authoring-pathway.test.js)
- Engentus app-owned authoring and route ownership:
  - [`examples/engentus/app.wtoml`](C:\Users\aaron\Documents\world\examples\engentus\app.wtoml)
  - [`examples/engentus/app/README.md`](C:\Users\aaron\Documents\world\examples\engentus\app\README.md)
- Current operator low-level rendering assets:
  - glyph atlas path
  - cell buffer path
  - framebuffer/Wasm experiments
  - frame/junction test expectations
- Validation work already present in:
  - [`src/operator-screen-specs.js`](C:\Users\aaron\Documents\world\src\operator-screen-specs.js)
- Useful interaction and expectation tests from:
  - [`test/operator-workbench.test.js`](C:\Users\aaron\Documents\world\test\operator-workbench.test.js)
  - [`test/operator-browser-example.test.js`](C:\Users\aaron\Documents\world\test\operator-browser-example.test.js)

These should be treated as reference material, not as the new root architecture.

---

## 7. What Not To Carry Forward As Foundation

Do not found the restart on:

- [`plugins/operator-workbench/tui-engine.js`](C:\Users\aaron\Documents\world\plugins\operator-workbench\tui-engine.js) as the product brain
- [`examples/operator/browser/operator-runtime.js`](C:\Users\aaron\Documents\world\examples\operator\browser\operator-runtime.js) as the place where semantics emerge
- compatibility mirror shapes such as parallel top-level overlay exports
- pane-derived semantic concepts such as "left screen" as core product truth
- defaults and inferred fallbacks for missing model structure
- host-owned semantic repair logic

These are migration sources, not new foundations.

---

## 8. Proposed Restart Structure

Suggested repo shape:

- `examples/operator2/`
- `src/operator-model/`
- `src/operator-mcp-authoring/`
- `src/operator-runtime-core/`
- `src/operator-compositor/`
- `src/operator-host-browser/`

Optional later:

- `src/operator-host-electron/`
- `src/operator-host-shell/`

Meaning:

- `operator-model`: semantic + presentation model definitions and validators
- `operator-mcp-authoring`: MCP-facing create/update/query pathways for the model
- `operator-runtime-core`: session state and intent application
- `operator-compositor`: layout/frame graph/cell scene lowering
- `operator-host-browser`: host renderer/input adapter only

---

## 9. Phased Scope

### Phase 0: Freeze principles

Required:

- define semantic vs presentation vs session boundaries
- ban defaults
- ban pane-derived semantic concepts
- define trait-based substitution rules
- define MCP-only mutation policy

Acceptance:

- a small written contract exists and is used as the design gate for subsequent work

### Phase 1: Canonical model over MCP

Required:

- define semantic content object kinds
- define presentation object kinds
- define trait representation
- define validation rules
- expose creation/update/read through MCP calls only

Acceptance:

- a small operator model can be created entirely through MCP calls
- invalid structure fails deterministically

### Phase 2: Authored `page.surface` workbench shell

Required:

- drive the first operator shell through the same authored `page.surface` lane as Engentus
- serve the shell from app-owned route definitions
- avoid direct product semantics in browser bootstrap/runtime code

Acceptance:

- the first restart shell is app-owned and route-served through `page.surface`
- no browser-only semantic bootstrap path is required

### Phase 3: Runtime core

Required:

- implement focus
- implement selection
- implement activation
- implement link following
- implement overlay open/close state
- implement scroll/cursor state

Acceptance:

- one thin host can dispatch intents and receive state without inventing semantics

### Phase 4: Compositor

Required:

- build one deterministic frame/compositor path from presentation objects plus session state
- own borders, handles, separators, overlay placement, and junctions there

Acceptance:

- no paint-order seam is required for visual correctness

### Phase 5: Browser host

Required:

- render model + runtime state + compositor output
- capture input and convert it into shared intents
- do not invent semantic state locally

Acceptance:

- browser host acts as renderer/adapter only

### Phase 6: Performance pass

Required:

- profile the browser host
- move only proven hot rendering loops into AssemblyScript/Wasm

Acceptance:

- AssemblyScript is used only where profiling justifies it
- behavior is unchanged by the optimization

---

## 10. Immediate First Milestone

The first milestone should be intentionally tiny:

- one app-owned operator2 example
- one semantic content object
- one presentation window showing it
- one help/context overlay
- one linkable target
- one MCP-authored mutation path
- one `page.surface` route
- one browser host

This milestone should prove:

- MCP-only model mutation
- no defaults
- strict validation
- no pane-derived semantics
- host does not invent product truth

---

## 11. AssemblyScript Scope

AssemblyScript is explicitly out of scope for:

- semantic model
- validation
- authoring logic
- MCP tool behavior
- substitution rules
- runtime state machine
- link/action semantics

AssemblyScript is only in scope for:

- framebuffer writes
- glyph compositing
- maybe deterministic low-level geometry math after profiling

Rule:

- build the reference path in JS first
- measure
- move only the hot loop

---

## 12. Acceptance Criteria For The Restart Direction

The restart direction is valid only if all of the following become true:

- the first operator2 shell can be authored and mutated through MCP calls only
- the first operator2 shell is served through app-owned authored `page.surface` routing
- semantic content identity is separate from presentation placement
- missing required structure causes validation failure
- no browser runtime path invents product semantics to heal the model
- AssemblyScript is optional and removable without semantic change

---

## 13. ATTN

- The current operator workbench tests are useful as expectations, but they encode host-era assumptions that should not all be preserved unchanged.
- The restart must resist reintroducing pane-era semantics through convenience terms such as `leftScreen`, `rightPane`, or shell-first navigation assumptions.
- If the restart cannot be driven through MCP authoring and authored `page.surface` output early, it is already drifting back into the old architecture.
