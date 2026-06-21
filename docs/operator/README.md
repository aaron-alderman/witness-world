# Operator

Start here:

- `00-why/`
- `10-zoo/`
- `20-relate/`
- `30-speak/`
- `40-contexts-and-environments/`
- `50-who/`
- `60-evidence/`

## Canonical model first

The canonical operator model is not the current workbench browse tree.

The canonical ontology root is:

- `Things`
- `Types`
- `Relationships`
- `Commands`
- `Witnesses`

`Session` is not a peer in that ontology.

It is operator/runtime sidecar state:

- selection
- focus
- aliases
- notes
- preview session
- saved views
- history
- undo/redo
- pane/overlay state
- viewport layout
- display settings

## Legacy browse projection

The current workbench still exposes a legacy browse projection:

- `Session`
- `World`
- `Platform`

That is a browse shell, not the canonical truth model.

Current world browse groups include:

- contexts
- surfaces
- processes
- capabilities
- widgets
- layout
- entities
- messages
- boundaries
- stores
- projections
- policies
- types
- modules
- things
- witnesses
- traits
- value types
- process specs
- graph nodes
- graph edges
- graph entity types
- graph edge types
- API
- vocabulary

Current platform browse groups include:

- plugins
- bundles
- docs
- folders
- tasks
- test gates
- test files
- doc sections
- doc references
- WTOML sources
- RVM sources
- WCSS sources
- files
- JSON sources
- runtime profiles
- telemetry metrics
- compatibility bridges
- boundaries
- roadmaps
- intent nodes
- test environments
- coverage edges
- mutable surfaces

Those groups must map onto the canonical ontology or be explicitly treated as deferred presentation concerns.

## Current adapter status

Two current authored grammars are adapters, not canonical truth:

- `plugins/operator-workbench/desire-rvm.js`
  - current plugin-owned `operator_*` workbench grammar
- `examples/operator/browser/operator.workbench.rvm`
  - browser-first prototype layout grammar

The canonical reset keeps both available, but treats them as adapters over a deeper ontology.

## Generated taxonomy

Use:

```bash
npm run operator:taxonomy
```

or:

```bash
npm run operator:taxonomy:json
```

to inspect the canonical roots, session sidecar, legacy browse mappings, and adapter coverage together.

## Tree

```text
docs/operator/
  README.md
  00-why/
    README.md
  10-zoo/
    README.md
    core/
      README.md
      adapters.md
      boundaries.md
      capabilities.md
      collections.md
      commands.md
      derives.md
      entities.md
      events.md
      messages.md
      policies.md
      processes.md
      queries.md
      states.md
      types.md
      views.md
    evidence/
      README.md
      relations.md
      things.md
      witnesses.md
    frontend/
      README.md
      frontend-programs.md
      projections.md
      routes.md
      serves.md
      surfaces.md
      widgets.md
    governance/
      README.md
      app-feature-access-policies.md
      auth-roles.md
      identity-role-grants.md
      proposals.md
      stewardship.md
    identity/
      README.md
      actors.md
      contexts.md
    runtime/
      README.md
      materialized-views.md
      mcp-servers.md
      runtime-preload.md
      server-runners.md
    extension/
      README.md
      package-dependencies.md
      package-namespaces.md
      package-patches.md
      package-revisions.md
      packages.md
      package-transformers.md
  20-relate/
    README.md
  30-speak/
    README.md
  40-contexts-and-environments/
    README.md
  50-who/
    README.md
  60-evidence/
    README.md
```
