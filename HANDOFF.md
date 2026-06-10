# Handoff Notes

## Current version

`0.34.0`

## How to run

```bash
npm test
npm run demo
```

Open:

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/world
http://127.0.0.1:3000/canvas
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
src/canvas-processes.js witnessed canvas processes (perspectives, placement, relations)
src/canvas-projection.js perspective/canvas projections over the witness log
src/canvas-page.js     /canvas page: Canvas 2D editor shell and client engine
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

## Current canvas behavior

`/canvas` is a witness-oriented diagram editor (CANVAS-v2 phase 1):

- pick an actor and a Perspective (witnessed Things of kind `perspective`)
- place Things as draggable nodes; each node is a `projectionInstance` proxy Thing, so geometry/style live on the proxy via `hasGeometry`/`hasStyle` relations with mutable meta (latest triple wins in `currentRelations`)
- connectors are real Relations between Things and show up in every perspective where both endpoints are placed
- the inspector separates Thing properties (reality: name, relations) from Projection properties (perspective: position, size, color)
- every mutation goes through `POST /api/canvas/process` and emits a `canvas.*` witness; reload or server restart reprojects the same layout from the log
- multi-select via marquee (empty-drag) or shift-click; group drag and group delete are atomic single witnesses (`canvas.moveMany`, `canvas.removeMany`, all-or-nothing)
- pan via Space-drag, middle-button, or Pan mode; resize via 8 handles on a single selected node (min 40x24)
- snap-to-grid is perspective state, witnessed via `canvas.grid` (`hasGrid` relation), like the camera
- a Thing may be placed multiple times in one perspective (`canvas.duplicate` / Ctrl+D, or re-place from the palette, which shows placed counts); connectors draw between every instance pair of the related Things
- small changes (geometry, style, camera, grid) go through a browser-side outbox: coalesced latest-wins per target and flushed after 1.5s as ONE atomic `canvas.batch` witness; structural ops flush the outbox first, and perspective/actor switches and page hide force-flush (keepalive fetch). One debounce window = one witness = one future undo step.

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
