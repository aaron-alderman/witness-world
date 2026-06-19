# Working Group Execution Set

This folder turns [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md) into execution documents.

Each file is organized the same way:

- mission
- end-state
- workstreams
- ordered execution ladder
- acceptance gates
- immediate next slices

The goal is not to restate the roadmap.

The goal is to make the next implementation moves obvious enough that work can be split, sequenced, and verified without re-deciding the whole platform each time.

## Files

- [Group A - Composition Core](./GROUP-A-COMPOSITION-CORE.md)
- [Group B - Runtime and Editing](./GROUP-B-RUNTIME-AND-EDITING.md)
- [Group C - Practical Backend](./GROUP-C-PRACTICAL-BACKEND.md)
- [Group D - Shells, Persistence, and Ecosystem](./GROUP-D-SHELLS-PERSISTENCE-AND-ECOSYSTEM.md)
- [Group E - Learning and Interaction](./GROUP-E-LEARNING-AND-INTERACTION.md)

## Shared Execution Rules

Every slice should satisfy the same bar:

- runtime behavior is truthful
- the owning concept is expressed in the model, DSL, or an explicit plugin boundary
- diagnostics or inspection reveal the behavior
- tests cover the seam at the right level
- compatibility bridges are named as bridges, not normalized as final structure

## Shared Guardrails For New Contributors

This project uses JavaScript as an implementation substrate.
It is not "just a JS app."

New contributors should assume the default move is **not** to add another helper, store, registry, React state pocket, or server route shortcut until they can explain why the behavior does not belong in the world model, the DSL, the witness flow, or an explicit plugin boundary.

The main failure mode here is not lack of effort.
It is competent normal-software reflexes applied to the wrong system shape.

### Do

- ask which authored noun should own the behavior before adding code
- preserve witness truth and projection honesty
- keep compatibility shims visibly transitional
- use diagnostics and inspector surfaces to reveal hidden assumptions
- prefer explicit runtime, shell, context, capability, and plugin boundaries

### Do Not

- treat the project as a conventional JS web app with a model layer attached
- hide product truth in ad hoc caches, stores, registries, or client-only state
- move semantics into host code just because it is faster to wire
- silently convert authored structure into implicit runtime convention
- treat bootstrap, demo, or compatibility seams as proof of the intended final shape

### Pre-Implementation Check

Before shipping a slice, be able to answer:

1. What is the owning noun in this system: world object, DSL form, capability, plugin, shell seam, or explicit compatibility bridge?
2. What witness or projection will reveal the behavior?
3. If this is implemented in JS, why is it universal runtime or explicit plugin logic rather than hidden app semantics?
4. What would a future contributor see that tells them this is real and not theatre?

## Shared Decomposition Pattern

When a topic is still too large, keep dropping one level:

1. capability area
2. workstream
3. slice
4. implementation task
5. acceptance check

If a slice still cannot be assigned to one engineer for one bounded pass, it is not yet decomposed enough.

## Cross-Group Dependency Shape

- Group A defines the compositional nouns and governance rules.
- Group B makes those nouns executable and editable in place.
- Group C provides the backend seams those executions depend on.
- Group D turns the system into a durable, operable, extensible product.
- Group E teaches and reveals the real system instead of inventing a fake simplified one.

## Current Strategic Bet To Carry Across Groups

If the platform is to express itself through its own language as much as possible, the implementation trend should be:

- prefer authored nouns over hidden host conventions
- prefer patch or change-set semantics over opaque imperative mutation where practical
- prefer namespaced coexistence over premature destructive merge resolution
- let MCP operate as an explicit authoring and operations seam, not as ambient power
- keep package, plugin, and runtime composition inspectable at every step

That bet is still partly design work.
It should be advanced as explicit slices, not smuggled in through convenience code.
