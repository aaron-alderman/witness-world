# 10 - Shells, Persistence & Ecosystem

## Role in Primary Intent

There is one world model. Desktop, browser, hosted, and automation (MCP) shells are thin adapters over it. Operator-owned persistence (WORLD_HOME) is the preferred contract. Shell-specific powers must stay explicit; they never leak into the core model as ambient truth.

See [../SHELLS-PERSISTENCE-ECOSYSTEM.md](../SHELLS-PERSISTENCE-ECOSYSTEM.md), [../EXPERIENCE.md](../EXPERIENCE.md) (Shells Are Adapters), [../CAPABILITIES.md](../CAPABILITIES.md#8-shell-distribution-and-ecosystem).

## Core Desires / Intents

### 10.1 Single coherent world model across all shells
**Defined:**
- "Desktop, browser, and hosted/server shells should all sit over the same core model."
- "Local development, CI, and production should also be different operating postures of that same product rather than separate mental models."

**Enacted:**
- Generic CLI: [../../src/cli.js](../../src/cli.js) (`serve`, `bootstrap`, `desktop`)
- Shared runtime startup, world creation, and plugin loading regardless of shell.
- Desktop is a narrow Electron adapter: [../../src/desktop-*.js](../../src/) (desktop-main, desktop-launcher-*, desktop-session-manager, desktop-bridge)
- Browser reachability via normal HTTP server.
- MCP as another transport adapter (plugins/mcp/*).

### 10.2 Shells are adapters; shell-only powers must stay explicit
**Defined in SHELLS doc:**
- Hard rules: shell-only powers (file dialogs, native packaging, stdio/HTTP transport details, cookie navigation) must never appear as ambient core powers.
- Current desktop-only powers are enumerated and kept local (launcher state, recent world homes under Electron app-data, not world truth).

**Enacted:**
- `window.witnessDesktop` bridge with narrow surface (`openWorldHome`, `createWorldHome`, `revealWorldHome`, `getDesktopShellState`).
- Desktop shell state is explicitly shell-local.
- Runtime operator contract: [../../src/runtime-operator-contract.js](../../src/runtime-operator-contract.js)

### 10.3 Preferred operator persistence via WORLD_HOME
Canonical layout:
```
$WORLD_HOME/
  logs/
  runtime/
  backups/
  exports/
  imports/
```

**Enacted:**
- CLI and app-runtime respect WORLD_HOME (preferred) and fall back to legacy RUNTIME_ROOT / WITNESS_LOG for compatibility.
- Startup prints warm/cold/ephemeral + active WORLD_HOME.
- [../../src/app-runtime.js](../../src/app-runtime.js), [../../src/desktop-launcher-recent-worlds.js](../../src/desktop-launcher-recent-worlds.js)

### 10.4 Desktop as the first shipped narrow but real ownership shell
- Launcher for open/create world homes.
- One active world at a time per desktop session.
- Clean switching without a second world model.

### 10.5 Ecosystem / distribution posture
Plugins, packages, and capabilities are the unit of extension. Long-term store/ecosystem protocol is future; current focus is honest local + authored plugin composition.

## Key Implementation

| Area                    | Files                                                                 |
|-------------------------|-----------------------------------------------------------------------|
| Generic entry           | src/cli.js                                                            |
| Desktop shell           | src/desktop-*.js (main, launcher-*, session-manager, bridge, preload) |
| Persistence / WORLD_HOME| src/app-runtime.js, runtime-startup-services, desktop-launcher-recent-worlds |
| Operator contract       | src/runtime-operator-contract.js , runtime-operator-service.js        |
| Shell contract doc      | docs/SHELLS-PERSISTENCE-ECOSYSTEM.md                                  |
| MCP shell               | plugins/mcp/* , plugins/mcp-authoring/*                               |

## Status / Honesty
- Browser + desktop shells over shared model: proven.
- Desktop ownership slice: "narrow but real".
- Full multi-user hosted posture, broader native integrations, and universal ecosystem protocol: future.
- Shell posture changes authority gates, risk tolerance, and presentation severity — not the fundamental model.

## Cross References
- Shares world model with every other category.
- Persistence enables 02 (witness logs live under WORLD_HOME).
- Desktop launcher integrates with 08 (first experience) and 11 (platform self-use).
- See also [../CAPABILITIES.md](../CAPABILITIES.md#8-shell-distribution-and-ecosystem)

## Primary Docs
- [../SHELLS-PERSISTENCE-ECOSYSTEM.md](../SHELLS-PERSISTENCE-ECOSYSTEM.md) (the frozen contract)
- [../EXPERIENCE.md](../EXPERIENCE.md) (Multi-shell environment)
- Top-level README "CLI", "Preferred operator-owned persistence", "desktop"
