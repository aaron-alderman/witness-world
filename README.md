# Witness World

Witness World is a small JavaScript prototype for a witness-oriented application runtime.

The core idea is:

```text
Things and relations are inert.
Processes attempt change.
Witnesses record what happened.
Projections render meaning for a context.
```

This repository is not only exploring a Todo demo. The broader direction is a truthful composition environment where:

- apps, editors, plugins, and inspectors all operate over the same witnessed world
- Sourcery can guide without becoming a fake abstraction layer
- capabilities remain inspectable instead of disappearing into hidden runtime magic
- desktop, browser, and hosted shells can sit over the same core model

See [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md) for the wider product direction.
See [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md) for the detailed capability breakdown and current do/don't rules.
See [docs/SHELLS-PERSISTENCE-ECOSYSTEM.md](C:\Users\aaron\Documents\world\docs\SHELLS-PERSISTENCE-ECOSYSTEM.md) for the explicit shell, operator-persistence, and ecosystem-trust contract.

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
- first-class capability objects with local catalog/install projections
- a guided tutorial that builds the Todo app through the real bootstrap surface
- dedicated World and Process views

## Quick start

```bash
npm install
npm test
npm run desktop
```

Supported public/browser-facing startup should prefer one Rust-frontdoored command at a time, for example:

```bash
npm run bootstrap   # blank-world authoring through the Rust frontdoor
# or
npm run engentus    # supervised Engentus app through the Rust frontdoor
```

Utility worker-only example flows still exist separately:

```bash
npm run utility:demo
npm run utility:engentus-worker
```

Then open the supported frontdoor surface:

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

- focused builders for identities, widgets, programs, routes, mounts, server runners, and capabilities
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
examples/demo-todo-app/
examples/_lib/common.wtoml
examples/_lib/demo-todo/backend.wtoml
examples/_lib/demo-todo/frontend.wtoml
```

The main file imports the split files and spawns frontend/backend contexts.

The type / trait model also lives in the demo DSL:

- `examples/_lib/common.wtoml` defines `trait`, `valueType`, and `processSpec` witnesses
- `examples/_lib/demo-todo/frontend.wtoml` uses `ValueEditor` widgets and schema-aware `readForm` for the widget editor

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
npm run bootstrap # start a blank-world bootstrap server
npm run engentus # start the supervised Engentus app through the Rust frontdoor
npm run utility:demo  # start the demo example worker on its private utility port
npm run desktop # start the first desktop ownership shell
```

## CLI

Supported public/browser-facing startup uses the checked-in Rust frontdoor wrappers such as:

```bash
npm run bootstrap
npm run engentus
npm run engentus:mcp
```

The raw CLI below is still available, but it is a loopback-only Node utility path rather than the supported public ingress:

```bash
node src/cli.js utility-serve <app-dir|app.wtoml> [--server <id>] [--port <n>]
node src/cli.js utility-bootstrap [--port <n>]
node src/cli.js desktop [<app-dir|app.wtoml>] [--desktop-target <id>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]
```

Examples:

```bash
node src/cli.js utility-bootstrap
node src/cli.js utility-serve examples/demo-todo-app --runtime-profile minimal
node src/cli.js utility-serve examples/demo-todo-app --port 4000 --runtime-profile minimal
node src/cli.js desktop
```

Notes:

- directory startup is the preferred public interface; direct file startup is only for canonical `app.wtoml`
- raw `serve`/`bootstrap` startup binds the Node runtime on `127.0.0.1` only and should be treated as a utility/development path
- `--server` is optional only when the app resolves to exactly one `serverRunner`
- `bootstrap` starts a blank-world authoring server and treats `/_bootstrap` as the primary seam
- the maintained demo app now runs on `minimal` plus authored runtime-plugin installs on `demo_server`, including `plugin.demo` for demo handler-set behavior
- `serverRunner.handlerSet = "demo"` no longer activates `bundle-demo`; the demo bundle must come from `plugin.demo` or a profile that already includes it
- blank-world bootstrap/tutorial startup is still a separate runtime-composition path from the pluginized maintained demo
- `desktop` starts the first shipped ownership shell: a narrow Electron adapter over the same runtime/profile/world model, with launcher-based `WORLD_HOME` open/create flows and explicit desktop-only powers
- `bootstrap` now starts from a fresh temp runtime root by default, so prior todo/private-note projection files are not reused across runs
- `npm run utility:demo` is the explicit demo worker utility command
- `npm run bootstrap` is a convenience wrapper around the checked-in Rust-supervised frontdoor config for blank-world startup
- `npm run desktop` is a convenience wrapper around `node src/cli.js desktop`
- `npm run engentus:mcp` is a convenience wrapper around the checked-in Rust-supervised frontdoor config for the Engentus HTTP MCP surface
- if the selected runner exposes a reachable home route, `/` serves the app
- if no served home route exists yet, `/` falls back to `/_bootstrap`
- set `RUNTIME_ROOT` explicitly only when you intentionally want a warm/persistent bootstrap restart

Preferred operator-owned persistence:

```bash
WORLD_HOME=/tmp/witness-world/demo
```

This yields the canonical layout:

```text
$WORLD_HOME/logs/
$WORLD_HOME/runtime/
$WORLD_HOME/backups/
$WORLD_HOME/exports/
$WORLD_HOME/imports/
```

Compatibility environment variables still work:

```bash
RUNTIME_ROOT=/tmp/witness-runtime
WITNESS_LOG=/tmp/witness-world.witnesses.jsonl
OBSERVATION_LOG=/tmp/witness-world.observations.jsonl
```

The CLI now prints whether startup is `warm`, `cold`, `warm-compatibility`, or `ephemeral`, and reports the active `WORLD_HOME` when one is in use.

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

The most important current behavior is that the app is increasingly described by witnessed data rather than hand-written special cases, that the maintained demo now runs on `minimal` plus authored runtime-plugin installs, and that a blank world can recover into a still-separate bootstrap seam that teaches and assembles a runnable app through the real product surface.

The current capability slice is real but still intentionally narrow:

- capability objects, installs, catalog projections, and bootstrap CRUD now exist
- legacy capability strings still bridge into that model as compatibility sugar
- route-page placement currently means route-root `Page` placement only
- deeper version/authority/store semantics are still future work

The current Todo/bootstrap path should be read as a proving ground, not the final product shape. The longer arc is to keep building out:

- truthful plugin/capability composition
- contextual Sourcery guidance
- editable-everywhere product surfaces
- coherent desktop/web/hosted shells over the same world model

Current migration caveat:

- the maintained demo is pluginized through authored runtime-plugin installs, including `plugin.demo`
- blank-world bootstrap/tutorial startup still follows a separate runtime-composition path

The detailed capability inventory for that longer arc lives in [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md).

