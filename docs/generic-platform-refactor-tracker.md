# Generic Platform Refactor Tracker

Goal: remove implementation-detail leaks where generic platform/runtime code depends on specific apps, demos, tutorials, or vertical projects.

## Phase 1: Extract Registries Out Of Core

- [ ] Replace hard-coded proposal target handling with provider registration.
  Files: [plugins/proposals/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposal-executor.js), [plugins/bootstrap/bootstrap-read-models.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-read-models.js)
  Notes: Introduce a `proposalTargetProviders` contribution shape so `demo`, `eden`, `canvas`, authoring, and future plugins register their own target executors.

- [ ] Remove direct core imports of demo/eden proposal implementations.
  Files: [plugins/proposals/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposal-executor.js)
  Notes: Core proposal execution should not import `executeDemoProposalTarget` or `requestEdenVersionPublish`.

- [ ] Replace hard-coded bootstrap guidance/starter fallback ids with neutral selection policy.
  Files: [src/runtime-guidance.js](/C:/Users/aaron/Documents/world/src/runtime-guidance.js), [src/runtime-guidance-model.js](/C:/Users/aaron/Documents/world/src/runtime-guidance-model.js)
  Notes: Remove fallback ids like `todo-from-scratch` and `todo-starter`; use only explicit config, `defaultForBootstrap`, or first available provider.

- [ ] Remove todo-specific default page/program/surface ids from core presentation and Eden flows.
  Files: [src/runtime-presentation.js](/C:/Users/aaron/Documents/world/src/runtime-presentation.js), [plugins/eden/eden-projection-runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-projection-runtime.js), [plugins/eden/eden-embedded-runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-embedded-runtime.js), [plugins/eden/eden-client-runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-client-runtime.js)
  Notes: Remove defaults such as `todo_app_widget`, `todo_frontend_program`, and `eden.surface.todo`; require config or use neutral/generated ids.

## Phase 2: Move App-Specific Logic Behind Plugin Contracts

- [ ] Make guidance completion checks pluggable.
  Files: [src/runtime-guidance-runtime-actions.js](/C:/Users/aaron/Documents/world/src/runtime-guidance-runtime-actions.js), [plugins/tutorial/tutorials.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorials.js)
  Notes: Replace built-in `todoExists`, `todoDone`, `todoMissing`, and `noteExists` with provider-registered evaluators or declarative query specs.

- [ ] Move todo/private-notes API assumptions out of the guidance engine.
  Files: [src/runtime-guidance-runtime-actions.js](/C:/Users/aaron/Documents/world/src/runtime-guidance-runtime-actions.js)
  Notes: Core guidance should not fetch `/api/todos` or `/api/private-notes` directly.

- [ ] Rename and generalize starter UI from a todo-specific shortcut to a blueprint-driven control.
  Files: [plugins/bootstrap/bootstrap-starter-controls.wtoml](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-starter-controls.wtoml), [plugins/bootstrap/bootstrap-starter-controls-view.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-starter-controls-view.js), [src/runtime-guidance-bootstrap-client.js](/C:/Users/aaron/Documents/world/src/runtime-guidance-bootstrap-client.js)
  Notes: Change “Todo Starter” / `create-todo-starter` semantics to neutral starter-blueprint semantics, with title and behavior supplied by the selected provider.

- [ ] Move starter blueprint naming, plugin installs, and runner defaults behind provider data.
  Files: [plugins/starter/runtime.js](/C:/Users/aaron/Documents/world/plugins/starter/runtime.js), [plugins/starter/starter-blueprints.js](/C:/Users/aaron/Documents/world/plugins/starter/starter-blueprints.js), [plugins/starter/todo-starter-blueprint.json](/C:/Users/aaron/Documents/world/plugins/starter/todo-starter-blueprint.json)
  Notes: The todo starter can remain a first-party blueprint, but bootstrap must not treat it as the platform default shape.

- [ ] Remove todo/private-notes storage fields from generic server-runner authoring.
  Files: [plugins/server-runner-authoring/server-runner-processes.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/server-runner-processes.js), [plugins/bootstrap/bootstrap-app-authoring-controls.wtoml](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-app-authoring-controls.wtoml)
  Notes: Replace `todoProjection` and `privateNotesProjection` with generic runtime storage descriptors or plugin-owned runtime config.

## Phase 3: Re-scope Vertical Code

- [ ] Move `pipeline-runtime` out of the platform-generic plugin set.
  Files: [plugins/pipeline-runtime/kalman-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/kalman-kernels.js), [plugins/pipeline-runtime/health-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/health-kernels.js), [plugins/pipeline-runtime/burst-fit-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/burst-fit-kernels.js)
  Notes: Best first move is to relocate this under an Engentus/example/vertical namespace rather than trying to genericize it in place.

- [ ] Stop runtime plugins from loading models directly from `examples_rvm/engentus/...`.
  Files: [plugins/pipeline-runtime/kalman-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/kalman-kernels.js), [plugins/pipeline-runtime/health-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/health-kernels.js), [plugins/pipeline-runtime/burst-fit-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/burst-fit-kernels.js)
  Notes: Model bodies should come from plugin-owned packaged assets or registered resource resolvers, not from example paths.

- [ ] Decide whether Engentus pipeline code should stay vertical-only or be reintroduced through a truly generic compute/model contract.
  Files: [plugins/pipeline-runtime/kalman-kernels.js](/C:/Users/aaron/Documents/world/plugins/pipeline-runtime/kalman-kernels.js), [src/desire/host-op-migration.js](/C:/Users/aaron/Documents/world/src/desire/host-op-migration.js)
  Notes: Make this an explicit product decision after relocation.

## Phase 4: Clean Remaining Surface-Level Leaks

- [ ] Remove todo-specific selectors from shared surface CSS primitives.
  Files: [src/runtime-surface-content-primitives.js](/C:/Users/aaron/Documents/world/src/runtime-surface-content-primitives.js)
  Notes: Replace `.todo-row` and `.todo-title` assumptions with neutral component classes or plugin-owned CSS.

- [ ] Remove demo-oriented authoring defaults from bootstrap forms.
  Files: [plugins/bootstrap/bootstrap-app-authoring-controls.wtoml](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-app-authoring-controls.wtoml)
  Notes: Defaults such as `demo_server` should become empty, neutral, generated, or provider-suggested.

- [ ] Remove generic runtime references to todo/demo where they are only used as convenience defaults.
  Files: [plugins/eden/handlers.js](/C:/Users/aaron/Documents/world/plugins/eden/handlers.js), [plugins/eden/eden-projection.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-projection.js), [plugins/eden/eden-edit-client.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-edit-client.js)
  Notes: Sweep remaining fallback ids after the earlier phases land.

## Validation

- [ ] Verify core runtime code no longer imports app-specific implementation modules for proposal execution, guidance checks, or presentation defaults.

- [ ] Verify bootstrap can operate with no todo tutorial and no todo starter installed.

- [ ] Verify server-runner authoring works without todo/private-notes projection fields.

- [ ] Verify Engentus pipeline functionality still works from its new vertical/example location.

- [ ] Add regression tests for provider-driven proposal targets, provider-driven guidance checks, and neutral Eden/presentation defaults.

## Recommended Execution Order

- [ ] 1. Proposal target registry
- [ ] 2. Guidance/starter default selection cleanup
- [ ] 3. Neutral presentation/Eden defaults
- [ ] 4. Pluggable guidance completion evaluators
- [ ] 5. Generic server-runner storage schema
- [ ] 6. Starter blueprint/UI generalization
- [ ] 7. Move `pipeline-runtime` into vertical scope
- [ ] 8. Final naming/CSS/default sweep
