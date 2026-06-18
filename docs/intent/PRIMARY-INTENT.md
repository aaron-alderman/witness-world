# Primary Intent (Root Node)

## Executive Summary

**The platform's root desire is to be a witness-oriented application runtime and ownership environment that preserves continuity of agency through witnessed memory.**

Core statement (from [../README.md](../README.md)):

> Things and relations are inert.  
> Processes attempt change.  
> Witnesses record what happened.  
> Projections render meaning for a context.

The system is deliberately built so that:

- Durable truth lives only in an append-only witness log.
- All read views, ownership, authority, and UI are projections.
- Apps, editors, inspectors, plugins, and guidance (Sourcery) are expressions over the same model.
- Authoring lowers through a small honest semantic kernel (DESIRE) rather than hidden runtime magic.
- The user (or operator) owns the world; shells are adapters.
- Truth is always preferred over convenience.

See the philosophical foundation in [../SYSTEM.md](../SYSTEM.md#the-witness-oriented-system).

This intent is not "build a better todo app" or "a nicer framework". It is to make a system in which important facts remain inspectable, recoverable, and governed by explicit witnessed chains instead of disappearing into code, config, or vendor black boxes.

## Realized Form Today

- Witness substrate + projection model: [../../src/witness-log.js](../../src/witness-log.js), [../../src/projectors-core.js](../../src/projectors-core.js), [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js)
- DESIRE kernel + lowering: [../../src/desire/](../../src/desire/) (see [ir.js](../../src/desire/ir.js), [wtoml.js](../../src/desire/wtoml.js), [rvm.js](../../src/desire/rvm.js), [apply.js](../../src/desire/apply.js))
- Runtime over the model: [../../src/runtime-*.js](../../src/) (especially runtime-execution-runner.js, runtime-surface-*.js, runtime-governance.js)
- Plugins as modeled capabilities: [../../plugins/](../../plugins/) (e.g. [plugins/proposals/](../../plugins/proposals/), [plugins/authoring-core/](../../plugins/authoring-core/), [plugins/canvas/](../../plugins/canvas/), [plugins/eden/](../../plugins/eden/))
- Multi-shell: desktop ([../../src/desktop-*.js](../../src/)), browser, hosted via the same CLI and runtime.
- Self-modeling platform surfaces: [../../plugins/platform/](../../plugins/platform/)

The primary intent is expressed in every honest layer: from the ontology in SYSTEM.md through the DESIRE kernel kinds all the way to live proposal flows and the world browser.

## Key Supporting Invariants (Non-Goals / Anti-Patterns)

- No hidden mutable side stores as canonical truth.
- No fake surfaces that claim capabilities without grounding in witnesses or explicit seams.
- Sourcery guides; it never steers or invents a simpler fake world.
- Shells and renderers are adapters, never owners of semantics.
- Capability and plugin installation must remain visible objects.

These are reinforced across [../EXPERIENCE.md](../EXPERIENCE.md), [../CAPABILITIES.md](../CAPABILITIES.md), and [../DESIRE-SPA.md](../DESIRE-SPA.md).

---

Next: See the raw list and categorization in [CATEGORIZED-LIST.md](./CATEGORIZED-LIST.md), then the structured tree in [INTENT-TREE.md](./INTENT-TREE.md).

Detailed treatment of each branch lives in the 12 category files (numbered for order):

- [01-foundational-philosophy-ontology.md](./01-foundational-philosophy-ontology.md)
- [02-witness-substrate-projections.md](./02-witness-substrate-projections.md)
- ... (see [README.md](./README.md) for the full list)
