# DESIRE+

## Purpose

`DESIRE+` is the source/debug IR above `DESIRE`.

It exists to preserve enough authored structure that:

- `RVM -> DESIRE+ -> RVM-like` is approximately possible
- `WTOML -> DESIRE+ -> WTOML-like` is approximately possible
- plugins can contribute new tree forms
- source provenance remains inspectable
- editor-facing projections have a stable intermediate representation

`DESIRE+` is not the semantic kernel.
It is the structured authored/debug layer that lowers into the kernel.

## Responsibilities

`DESIRE+` is responsible for:

- modules and imports
- source grouping
- plugin surface forms
- explicit runtime declarations
- explicit surface trees such as widgets/DOM-like nodes
- preservation of source ancestry
- rewrite application and normalization history

`DESIRE+` is not responsible for:

- being the final execution algebra
- being the final storage normalization
- being the only rendered source view

## Core idea

The stack is:

```text
WTOML ----\
           -> DESIRE+ -> DESIRE -> runtime/lowered forms
RVM   -----/
```

`DESIRE+` should keep more authored tree than `DESIRE`, but less accidental syntax than the original source text.

Think of it as:

- typed AST
- explicit source provenance
- explicit rewrite history
- partially normalized author intent

## DESIRE+ inventory

This draft keeps the following additional kinds on top of the kernel:

- `module`
- `import`
- `usingPlugin`
- `rewrite`
- `runtime`
- `route`
- `serve`
- `surfaceNode`
- `widgetTree`
- `contract`
- `schemaHint`
- `editorHint`
- `provenance`

Some of these are source-level conveniences; some are explicit runtime forms that should never enter the kernel unchanged.

## Current Internal Schema

This milestone does not close DESIRE+ over a fixed plugin universe. Plugin-authored node kinds can still be introduced later.

The built-in node kinds currently validated by the in-repo pipeline are:

- `wtoml.doc`
- `rvm.form`

Built-in nodes must carry:

- `id`
- `kind`
- `name?`
- `order`
- `trace`
- `payload`
- `semantic?`
- `meta`

Built-in `meta.sourceCategory` is explicit and currently one of:

- `semantic`
- `runtime`
- `source`
- `graph-data`
- `fixture-corruption`
- `unknown`

Built-in `meta.desireBoundary`, when present, is one of:

- `desire-kernel`
- `desire-plus-only`
- `needs-classification`

Built-in residual categories currently used by RVM ingestion are:

- `authored-runtime`
- `conflict-marker`
- `graph-data`
- `lowered-runtime`
- `unknown`

The current built-in semantic kind vocabulary is:

- `actor`
- `boundary`
- `capability`
- `context`
- `dataflow`
- `entity`
- `import`
- `message`
- `module`
- `policy`
- `process`
- `projection`
- `state`
- `stdlib`
- `store`
- `surface`
- `type`

This is intentionally a built-in contract, not a final global ban on plugin-provided forms.

## Plugin model

Plugins may contribute:

- new authored form kinds
- new tree-to-tree rewrites
- new surface node families
- new runtime declaration families

But canonical meaning still resolves through:

```text
plugin form -> DESIRE+ normalized form -> DESIRE
```

This keeps plugin extension first-class without allowing arbitrary hidden semantics.

## Boundary with DESIRE

What lowers from `DESIRE+` into `DESIRE`:

- messages
- entities
- projections
- dataflows
- semantic boundaries
- capabilities
- process state and rules
- semantic surfaces and intents
- policy
- contexts

What stays above the boundary:

- server runners
- routes and transport mappings
- runtime/plugin installation
- widget/DOM implementation trees
- source module/import layout
- editor metadata
- pretty-print support metadata
- exact authored grouping choices

## Why both levels are needed

Without `DESIRE+`:

- `RVM` loses too much tree structure too early
- `WTOML` cannot preserve explicit runtime/source graph structure
- plugin-authored source forms have nowhere principled to live
- debugging becomes too detached from authored source

Without `DESIRE`:

- the system never gets a small canonical meaning layer
- runtime and source representation remain coupled
- optimization and semantic comparison stay brittle

## Concrete stance on current source languages

### RVM

`RVM` is closer to semantic authorship.

Examples from [todo-v3-alpha.rvm](/C:/Users/aaron/Documents/world/examples_rvm/todo-v3-alpha/fixtures/source-input/todo-v3-alpha.rvm):

- `message` maps almost directly into kernel `message`
- `entity` maps almost directly into kernel `entity`
- `process` maps almost directly into kernel `process`

But `RVM` still has support/source forms that should remain in `DESIRE+`, especially DOM-oriented authored substrate in [todo-support-v3-alpha.rvm](/C:/Users/aaron/Documents/world/examples_rvm/todo-v3-alpha/fixtures/source-input/todo-support-v3-alpha.rvm).

### WTOML

`wtoml` is closer to explicit runtime graph authoring.

Examples from:

- [common.wtoml](/C:/Users/aaron/Documents/world/examples/demo/common.wtoml)
- [backend.wtoml](/C:/Users/aaron/Documents/world/examples/demo/backend.wtoml)
- [frontend.wtoml](/C:/Users/aaron/Documents/world/examples/demo/frontend.wtoml)

Some `wtoml` forms lower cleanly into `DESIRE`:

- `context`
- `capability`
- parts of `frontendProgram` and `step`

Other forms are better treated as `DESIRE+ runtime` or `DESIRE+ surfaceNode`:

- `serverRunner`
- `route`
- `serve`
- `mcpServer`
- `widget`
- `page`
- `form`

## Rewrites

Initial rewrite split:

- `surface rewrites`
  - author-friendly tree forms to canonical `surface`
- `runtime rewrites`
  - explicit runtime forms into boundary/placement mappings
- `contract rewrites`
  - source contract sugar into messages, boundaries, projections, and process rules

Rewrites may be provided by plugins, but their outputs should still be inspectable in `DESIRE+`.

## Approximate round-tripping

The round-tripping target is:

- `RVM -> DESIRE+ -> RVM-like`
- `WTOML -> DESIRE+ -> WTOML-like`

The target is not:

- `DESIRE -> RVM`
- `DESIRE -> WTOML`

Once a source has crossed into `DESIRE`, many tree choices may legitimately be gone.
