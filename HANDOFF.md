# Handoff Notes

## Current version

`0.30.0`

## How to run

```bash
npm test
npm run demo
```

Open:

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/world
```

## Architecture summary

The system is built around:

```text
Thing
Relation
Process
Witness
Context
Projection
```

Derived concepts include ownership, stewardship, state, UI, source views, and primitive browsers.

## Canonical state

The canonical source is the witness log.

Projection caches such as todo JSON are derived and should not be treated as truth.

## Important modules

```text
src/kernel.js          core world/witness helpers
src/witness-log.js     append-only witness persistence
src/dsl.js             TOML-ish DSL parser/application
src/widgets.js         widget projection, HTML rendering, browser engine
src/host.js            HTTP server, routes, backend capability boundary
src/world-graph.js     world graph/object browser projection
src/process-graph.js   async process graph runner
src/projections.js     todo/private-note projections
src/gates.js           central gate helpers
src/logger.js          structured backend logging
```

## Current world browser behavior

`/world` has three modes:

- Graph
- Primitive Browser
- Source Browser

The source browser is intentionally VS-Code-like:

- file list on the left
- line-numbered editor
- selected definition highlighted
- references clickable where they match graph objects

## Things to be careful about

1. Do not put view-local state on represented things. Use proxies/projections.
2. Do not add direct mutation routes. Route changes should emit witnesses.
3. Do not reintroduce hard-coded widget special cases unless they are clearly compatibility shims.
4. Do not make JSON projection files canonical.
5. Keep frontend/backend capabilities separate.
6. When adding UI, add browser/runtime regression tests.

## Known weak spots

- The browser runtime is still string-generated JS.
- The DSL is still a bootstrap authoring format, not the final self-hosted graph editor.
- Source highlighting is heuristic, not a full AST editor.
- World graph layout is lightweight and deterministic, not ELK-grade yet.
- Object/value typing exists as runtime typed value widgets, not a full semantic type system.

## Suggested next command for a new developer

```bash
npm test && npm run demo
```

Then open `/world` and inspect the graph/source browser while interacting with the Todo app.
