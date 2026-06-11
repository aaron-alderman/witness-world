# Witness World

Witness World is a small JavaScript prototype for a witness-oriented application runtime.

The core idea is:

```text
Things and relations are inert.
Processes attempt change.
Witnesses record what happened.
Projections render meaning for a context.
```

The demo is a Todo app that is intentionally more complicated than a normal Todo app because it exercises the architecture:

- a canonical append-only witness log
- projected todo state
- frontend/backend capability separation
- identity-backed session handling
- widget definitions from DSL
- witnessed traits, value types, and process specs
- typed widget-editor flow through schema-driven value editors
- versioned widgets and live activation
- personal projections with private notes
- a bootstrap seam that can recover a blank world into a runnable app
- a guided tutorial that builds the Todo app through the real bootstrap surface
- dedicated World and Process views

## Quick start

```bash
npm install
npm test
npm run demo
```

Then open:

```text
http://127.0.0.1:3000/
```

Bootstrap seam:

```text
http://127.0.0.1:3000/_bootstrap
```

World Browser:

```text
http://127.0.0.1:3000/world
```

Process View:

```text
http://127.0.0.1:3000/process
```

Canvas:

```text
http://127.0.0.1:3000/canvas
```

## Demo pages

### `/`

The Todo app.

It includes:

- login / logout
- todos
- private notes
- typed widget editor
- version playground
- witness inspector

### `/_bootstrap`

The semi-internal bootstrap seam.

It includes:

- focused builders for identities, widgets, programs, routes, mounts, and server runners
- blank-world recovery when no reachable home app route exists
- a first-class guided tutorial that walks through building the Todo app from scratch
- a de-emphasized fast path for experienced users

### `/world`

The object browser / world inspector.

It has first-class modes:

- **Graph** - context/relationship map
- **Thing List** - browse witnessed objects grouped by inferred kind
- **Primitive Browser** - browse primitive values such as strings, numbers, kinds, badges, unresolved refs
- **Source Browser** - VS-Code-like source view of witnessed DSL files
- links into dedicated process inspection where appropriate

The left drawer shows selected object details:

- object properties
- values
- associations from/to the object
- association properties
- source definition provenance
- typed process/type metadata when selecting `trait`, `valueType`, or `processSpec` objects

### `/process`

The process-centric execution view.

It focuses on:

- authored frontend process graphs
- recent runs and recorded traces
- inline failures and async boundaries
- read-only replay of recorded runs

### `/canvas`

The canvas projection surface.

It uses the same session model as the main app in normal browser use, while still exposing canvas-specific projection and process APIs.

## DSL entry point

The main demo DSL is split into files:

```text
examples/demo-todo-server.wtoml
examples/demo/common.wtoml
examples/demo/backend.wtoml
examples/demo/frontend.wtoml
```

The main file imports the split files and spawns frontend/backend contexts.

The type / trait model also lives in the demo DSL:

- `examples/demo/common.wtoml` defines `trait`, `valueType`, and `processSpec` witnesses
- `examples/demo/frontend.wtoml` uses `ValueEditor` widgets and schema-aware `readForm` for the widget editor

## Design notes

The project deliberately avoids TypeScript for now. Instead it relies on:

- small modules
- explicit tests
- runtime witnesses
- robust route logging
- visible failure paths

## Important scripts

```bash
npm test      # run all tests (unit + integration, no browser required)
npm run demo  # start the demo server
```

## CLI

The runtime starts through one generic CLI entrypoint:

```bash
node src/cli.js serve <dslPath> [--server <id>] [--port <n>]
```

Examples:

```bash
node src/cli.js serve examples/demo-todo-server.wtoml --server demo_server
node src/cli.js serve examples/demo-todo-server.wtoml --port 4000
```

Notes:

- `--server` is optional only when the DSL resolves to exactly one `serverRunner`
- `npm run demo` is a convenience wrapper around the generic CLI
- if the selected runner exposes a reachable home route, `/` serves the app
- if no served home route exists yet, `/` falls back to `/_bootstrap`

Useful environment variables:

```bash
RUNTIME_ROOT=/tmp/witness-runtime
WITNESS_LOG=/tmp/witness-world.witnesses.jsonl
OBSERVATION_LOG=/tmp/witness-world.observations.jsonl
```

The CLI prints the resolved server URL, definition path, selected runner, and log locations on startup.

## Browser / UI tests

The UI tests use Playwright and require Chromium to be installed once:

```bash
npx playwright install chromium
```

Then:

```bash
npm run test:ui   # browser tests only
npm run test:all  # unit + integration + browser
```

## Current status

This is not a production framework. It is a working architecture probe.

The most important current behavior is that the app is increasingly described by witnessed data rather than hand-written special cases, and that a blank world can now recover into a bootstrap seam that teaches and assembles a runnable app through the real product surface.
