# Runtime Stack Map

This document exists to stop local seam work from drifting away from the
runtime that is already present in the repo.

The problem it addresses is concrete: `page.surface` work kept being designed
too close to the failing seam, while existing runtime layers above and below it
were not being traced first. That produced repeated false primitives:

- host-local routing
- host-local screen selection
- bespoke projection/rendering seams
- local interaction contracts that ignored existing runtime ownership

This file is the required read-first map for runtime/frontend work, especially
for Engentus and the constrained authoring pathway.

The concrete `runtime*` inventory and audit ordering companion lives in
`docs/RUNTIME-AUDIT-INVENTORY.md`.

## Purpose

- record the existing runtime layers from top to bottom
- name the actual owner of each concern
- show which files are canonical runtime infrastructure and which are legacy or
  transitional
- give a mandatory audit order before changing `page.surface` or related seams

## Top-to-bottom stack

### 1. Runtime composition

Primary files:

- `src/runtime-bundles.js`
- `src/runtime-bundle-handler-assembly.js`

These files define the active runtime composition:

- which bundles are present
- which handlers are authorable
- which page handlers are active
- which core hooks and generic handler factories are installed

This is the first place to look when asking "is this runtime behavior supposed
to exist at all?".

### 2. Request orchestration

Primary file:

- `src/runtime-route-handlers.js`

This is the main runtime request assembly/orchestration layer. It wires:

- runtime contributions
- core hooks
- route handlers
- projection services
- authoring services
- plugin/runtime support services

This is where a request is handed into the active runtime. It is not the place
for app-local screen logic.

### 3. Route matching

Primary file:

- `src/runtime-routing.js`

This is the canonical document-route seam. It owns:

- route-path matching
- route-table lookup
- bootstrap fallback decision

It is the only acceptable place for router-level pathname matching.

### 4. Active page handlers

Primary file:

- `src/runtime-core-handlers.js`

This is where `page.home` and `page.surface` actually enter the runtime. It is
the correct seam for:

- dispatch from route resolution into a page handler
- selecting the correct host/projection path for a route

It is not the place for app-owned navigation semantics.

### 5. Generic presentation/theme

Primary files:

- `src/runtime-presentation.js`
- `src/runtime-surface-kit.js`

These files are the generic presentation layer. They already own:

- page theme token resolution
- CSS variable emission
- generic page chrome CSS
- shared surface-kit styling

This is the acceptable generic place for theme/chrome mechanics. It is not a
router, controller, or state owner.

### 6. `page.surface` host

Primary file:

- `src/runtime-surface-shell.js`

This file should remain the mechanical surface host only. Acceptable concerns:

- pathname normalization
- surface witness lookup
- root surface lookup
- static host projection
- blocked/reset host output
- emission of minimal runtime manifest/bootstrap data when the interactive
  consumer is genuinely available

Unacceptable concerns:

- app routing
- child screen selection
- process execution
- projection recompute
- capability lifecycle
- chart mounting
- Engentus/product semantics

### 7. Canonical surface interaction consumer

Primary file:

- `src/runtime-surface-interaction-runtime.js`
- `src/runtime-execution-runner.js`
- `src/runtime-reconcile-service.js`
- `src/runtime-surface-dom-host.js`

This is the nearest existing seam for interactive `surface` execution. It is
now being rebased around an explicit split:

- execution/control-flow lives in `runtime-execution-runner.js`
- rendered-tree / patch planning lives in `runtime-reconcile-service.js`
- browser DOM application lives in `runtime-surface-dom-host.js`
- `runtime-surface-interaction-runtime.js` is the orchestration layer over
  those seams

This is the intended canonical direction for interactive `page.surface`
execution.

Potentially salvageable generic helpers:

- `resolveSurfaceRuntimeBinding(...)`
- `resolveSurfaceCapabilities(...)`
- `eventValueFromSpec(...)`
- `whenSettled(...)`

What is not blessed:

- emitted browser module as authority
- any hidden contract not directly justified by semantic `surface` data
- any surface-kind-specific branching
- DOM timing guesses as a substitute for a first-class runtime barrier

### 8. Semantic substrate

Primary files:

- `src/desire/ir.js`
- `src/desire/normalize.js`
- `src/desire/apply.js`
- `src/desire/process-eval.js`

This is the canonical semantic foundation. Relevant existing surface semantics
already present here:

- `processRef`
- `delay` / authored async steps now register through the shared execution
  runner, but `process-eval` remains the semantic process executor rather than
  becoming the full UI/runtime settle owner
- `projectionRefs`
- `capabilityRefs`
- `bindings`
- `interactions`

Relevant process/runtime semantics already present here:

- process state
- message delivery
- state writes
- projection definitions

This layer should drive runtime shape, not the other way around.

### 9. Constrained authoring contracts

Primary files:

- `plugins/authoring-core/authoring-core-processes.js`
- `src/runtime-authoring-policy.js`

This is the public constrained write surface and policy boundary. It defines:

- `surface.create`
- `process.create`
- `projection.create`
- `type.create`
- `message.create`
- `route.create`
- `serve.create`

This is the public authored input path the runtime must faithfully consume.

### 10. Legacy widget/program path

Primary files:

- `src/runtime-widget-page.js`
- `plugins/inspect/widget-page.js`
- `src/widgets.js`

This path is real and feature-rich, but it is not the canonical constrained
frontend model. It remains useful only as:

- legacy runtime behavior
- prior art for render/update loops
- evidence of mechanics that might be generalized later

It must not silently become the authority for `page.surface`.

## Concern ownership

This table is the key anti-drift rule.

| Concern | Canonical owner | Must not own it |
| --- | --- | --- |
| Route path matching | `src/runtime-routing.js` | `runtime-surface-shell`, app-local runtimes |
| Request dispatch | `src/runtime-route-handlers.js` + `src/runtime-core-handlers.js` | app shell code |
| Page theme/chrome tokens | `src/runtime-presentation.js` | `runtime-surface-shell`, app-local JS |
| Surface witness lookup | `src/runtime-surface-shell.js` | app-local JS |
| Process execution | `src/desire/process-eval.js` and consuming runtime | `runtime-surface-shell` |
| Message/state transitions | semantic `process` + runtime consumer | `runtime-surface-shell` |
| Projection recompute | semantic `projection` + runtime consumer | `runtime-surface-shell` |
| DOM patching | canonical interactive consumer | `runtime-surface-shell` |
| Capability resolution | runtime consumer + plugin system | `runtime-surface-shell` ad hoc branches |
| App navigation meaning | authored `surface + process + route + message` model | host-local screen selection |

## Engentus implications

The Engentus target is not "make `page.surface` do something plausible." It is:

- login -> home -> module -> signout
- with one authored navigation model
- on one canonical runtime path
- without host-local routing or app-local browser facades

For that reason:

- `runtime-routing.js` is the real document router
- `runtime-surface-shell.js` must not become a second router
- `runtime-presentation.js` is the right generic theme/chrome layer
- `runtime-surface-interaction-runtime.js` is only useful insofar as it can
  consume existing semantic `surface` data generically

If a change creates another owner for routing, state, or projection, it is the
wrong direction even if it makes a test pass.

## What was missed

These were the concrete blind spots that caused repeated drift:

- `src/runtime-bundles.js`
- `src/runtime-bundle-handler-assembly.js`
- `src/runtime-route-handlers.js`
- `src/runtime-core-handlers.js`
- `src/runtime-bundle-support-services.js`
- `src/runtime-routing.js`
- `src/runtime-presentation.js`
- `src/runtime-surface-kit.js`
- `src/desire/apply.js`
- `src/desire/process-eval.js`
- `plugins/authoring-core/authoring-core-processes.js`

They did not appear later. They were already present and should have been the
starting point.

## Mandatory audit order before changing `page.surface`

Before changing `page.surface`, trace this order:

1. `src/runtime-bundles.js`
2. `src/runtime-bundle-handler-assembly.js`
3. `src/runtime-route-handlers.js`
4. `src/runtime-routing.js`
5. `src/runtime-core-handlers.js`
6. `src/runtime-presentation.js`
7. `src/runtime-surface-shell.js`
8. `src/runtime-surface-interaction-runtime.js`
9. `src/desire/ir.js`
10. `src/desire/normalize.js`
11. `src/desire/apply.js`
12. `src/desire/process-eval.js`
13. `plugins/authoring-core/authoring-core-processes.js`

If a proposed change does not fit cleanly into that stack, it is probably a new
parallel seam.

## Decision rule

When evaluating a runtime change, ask:

1. Which existing layer already owns this concern?
2. Is the proposed change preserving single ownership?
3. Is the change consuming authored semantics, or inventing a new hidden
   contract?
4. Is the widget/program runtime being used as prior art only, rather than as
   silent authority?
5. Does this move Engentus closer on the canonical path, or merely make a local
   rung pass?

If these cannot be answered concretely from the files above, stop and audit the
stack first.
