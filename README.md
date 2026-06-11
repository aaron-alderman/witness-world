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
- widget definitions from DSL
- versioned widgets and live activation
- personal projections with private notes
- a World Browser for graph, primitive, and source views

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

World Browser:

```text
http://127.0.0.1:3000/world
```

## Demo pages

### `/`

The Todo app.

It includes:

- actor selector
- todos
- private notes
- widget editor
- version playground
- witness inspector

### `/world`

The object browser / world inspector.

It has first-class modes:

- **Graph** — context/relationship map
- **Primitive Browser** — browse primitive values such as strings, numbers, kinds, badges, unresolved refs
- **Source Browser** — VS-Code-like source view of witnessed DSL files

The left drawer shows selected object details:

- object properties
- values
- associations from/to the object
- association properties
- source definition provenance

## DSL entry point

The main demo DSL is split into files:

```text
examples/demo-todo-server.wtoml
examples/demo/common.wtoml
examples/demo/backend.wtoml
examples/demo/frontend.wtoml
```

The main file imports the split files and spawns frontend/backend contexts.

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

The most important current behavior is that the app is increasingly described by witnessed data rather than hand-written special cases.
