# 05 - Capabilities, Plugins & Extensibility

## Role in Primary Intent

Capabilities and plugins must remain first-class, inspectable, owned objects in the world ("glass atoms"). They are never allowed to disappear into hidden runtime magic or host privileges. Extensibility happens through explicit modeled contribution points.

Core references: [../CAPABILITIES.md](../CAPABILITIES.md#6-capability--plugin-system), [../DESIRE-SPA.md](../DESIRE-SPA.md) ("plugin.authoring is the only constrained write path"), and the plugin loader.

## Core Desires / Intents

### 5.1 Capabilities are first-class authored objects
A capability declares verbs and scope. Installation, catalog, placement, and removal are modeled operations.

**Formal definition:**
- [../CAPABILITIES.md](../CAPABILITIES.md#61-first-class-capability-object-model), 6.2, 6.3, 6.4
- Kernel kind: `capability`

**Enacted:**
- Capability authoring plugin: [../../plugins/capability-authoring/](../../plugins/capability-authoring/) (handlers, processes, proposal targets).
- Kernel representation via DESIRE apply.
- Catalog / install projections in various plugins (eden capability shelf, etc.).
- Legacy compatibility bridge still exists in [../../src/capability-compatibility.js](../../src/capability-compatibility.js) and [../../src/capability-legacy-migration.js](../../src/capability-legacy-migration.js) — intentionally transitional.

### 5.2 Installed capabilities and plugins stay visible and queryable ("glass")
**Defined:**
- EXPERIENCE and CAPABILITIES: "Installed capabilities stay visible as capabilities. They do not disappear into hidden expansion."
- "Plugins Are Glass Atoms"

**Enacted:**
- Plugin metadata exposed via plugin.json + runtime contributions.
- World graph and inspect surfaces show installed capabilities.
- Capability shelf in Eden, versioned widget flows, proposal creation for install all surface the objects.

### 5.3 Explicit extension points instead of implicit host behavior
Plugins contribute via `desireExtensions`, handler catalogs, runtime declarations, projections, etc. Unregistered forms are rejected rather than silently accepted.

**Enacted:**
- [../../src/desire/plugins.js](../../src/desire/plugins.js) and apply.js registry (`createDesirePlusElaboratorRegistry`, runtime declaration handlers).
- [../../src/runtime-plugin-loader.js](../../src/runtime-plugin-loader.js): validates exports, loads trusted plugins, builds contribution sets.
- Handler catalogs in many plugins (e.g. [../../plugins/http-outbound/handler-catalog.js](../../plugins/http-outbound/handler-catalog.js)).
- Core builtins vs. plugin-provided in [../../src/runtime-builtins.js](../../src/runtime-builtins.js) and per-plugin runtime.js.

### 5.4 "plugin.authoring" as the constrained write path
From DESIRE-SPA:
- Only constrained public frontend model: surface + process + projection + capability.
- Blocked means stop, not improvise.
- No second generic frontend initiative.

**Implementation:**
- Runtime authoring policy: [../../src/runtime-authoring-policy.js](../../src/runtime-authoring-policy.js)
- Authoring-core and specific authoring plugins gate mutations.
- MCP authoring lane also goes through the same proposal + governance model.

### 5.5 Runtime profiles, bundles, and handler sets are modeled composition
The maintained demo runs on `minimal` + authored runtime-plugin installs (including `plugin.demo`).

**Evidence:**
- CLI and startup in [../../src/cli.js](../../src/cli.js), [../../src/runtime-bundles.js](../../src/runtime-bundles.js), [../../src/runtime-bundle-handlers.js](../../src/runtime-bundle-handlers.js)
- Demo plugin: [../../plugins/demo/](../../plugins/demo/) (handler-set, todo-runtime, private-notes, proposal targets).

## Current Status & Caveats (Honesty)
- Core capability object model + installs + catalog are `real but narrow`.
- Placeholder capability synthesis from legacy strings is a compatibility bridge.
- Many app-specific mutation flows still sit beside the shared governance path (not yet fully unified).
- Plugin loader requires explicit registration for new runtime declarations and elaborators.

## Implementation Map

| Area                        | Key Files / Plugins                                      |
|-----------------------------|----------------------------------------------------------|
| Capability model + authoring| plugins/capability-authoring/* , src/capability-*.js    |
| Plugin loading & extensions | src/runtime-plugin-loader.js , src/desire/plugins.js    |
| Registry / contributions    | per-plugin runtime.js + handler-catalog.js              |
| Authoring constraints       | src/runtime-authoring-policy.js , plugins/authoring-core|
| Demo / reference plugin     | plugins/demo/                                            |
| Legacy bridge (transitional)| src/capability-compatibility.js , capability-legacy-migration.js |

## Cross References
- Builds on: 03 (capabilities/boundaries are kernel nouns), 04 (composition primitives)
- Governed by: 06 (installs and mutations require authority + proposals)
- Visible through: 07 (inspection), 08 (Sourcery can recommend capabilities), 11 (platform console shows plugins)
- Backend capabilities (category 12) are a major consumer of this model.

## Key Documentation
- [../CAPABILITIES.md](../CAPABILITIES.md#6-capability--plugin-system)
- [../DESIRE-SPA.md](../DESIRE-SPA.md) (thesis on constrained authoring)
- [../PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md](../PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md)
