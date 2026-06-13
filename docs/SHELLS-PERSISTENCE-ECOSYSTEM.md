# Shells, Persistence, and Ecosystem Contract

This document records the concrete contract now being treated as baseline for the `Shells, Persistence, and Ecosystem` roadmap area.

It is intentionally narrower than the full aspiration.
The point is to freeze the invariants that later work must preserve.

---

## 1. Shell Contract

The platform currently has one shared truth and multiple shell adapters.

### Core responsibilities

- the witness-oriented world model is canonical truth
- generic execution, capability plumbing, and bundle/profile composition belong to the runtime
- shells adapt transport and local experience
- plugins expose capabilities, metadata, provenance, compatibility, and eventually executable extension seams

### Current shell roles

- `browser`: the reachability proof
- `mcp`: the automation proof
- `desktop`: the first local ownership proof over the same runtime and world model

### Hard rules

- shell-only powers must stay explicit
- MCP transport semantics must remain shell-facing rather than becoming world-model assumptions
- desktop-only powers such as file dialogs, native save/open, packaging, and updates must never appear as ambient core powers
- shells are adapters over one world, not alternate products with separate truths

### Current shell-only powers

- `browser`: page navigation, session cookies, live page rendering
- `mcp`: stdio/HTTP transport bridging, tool invocation, delegated versus service acting modes
- `desktop`: native world-home open/create directory picking, reveal-in-file-manager, launcher-window ownership flow, and shell-local desktop session state

### Current desktop ownership slice

The first desktop shell is now shipped as a narrow Electron adapter over the shared runtime.

Current desktop contract:

- `node src/cli.js desktop [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]` starts the runtime in `desktop` startup mode
- when no `WORLD_HOME` is chosen up front, Electron opens a tiny launcher window before any runtime-backed app page loads
- the launcher allows `Open Existing World`, `Create New World`, shows recent world homes, and exposes the active runtime profile
- a desktop session manager owns one active world at a time: current `WORLD_HOME`, active runtime handle, recent worlds, launcher visibility, and current desktop shell state
- desktop shell state is shell-local rather than world truth and currently includes `shellId`, `worldHome`, `runtimeProfile`, `availablePowers`, `recentWorldHomes`, `launcherRequired`, and `runtimeStatus`
- the only renderer bridge is `window.witnessDesktop`, with `openWorldHome()`, `createWorldHome()`, `revealWorldHome()`, and `getDesktopShellState()`
- switching worlds replaces the active local runtime cleanly, retargets the main window, and updates recent-world metadata without introducing a second world model

Current desktop validation rules:

- `openWorldHome()` accepts only an existing `world-home-v1` directory
- `createWorldHome()` may initialize an empty or new directory as `world-home-v1`
- obvious invalid targets such as files or unusable directories are rejected
- desktop-local recent-world metadata is persisted outside world truth under the Electron app-data root

Current intentional limits:

- one desktop process owns one active world at a time
- the first desktop powers are ownership-focused only; there is still no ambient filesystem bridge
- packaging, auto-update, tray, notifications, remote sync, and broader native integrations remain out of scope for this slice

---

## 2. Operator Persistence Contract

Persistence is now described as an operator-facing contract rather than only a set of environment variables.

The desktop shell uses this same contract directly.
It does not introduce a separate desktop-only storage layout; desktop world selection is just explicit ownership over `WORLD_HOME`.

### Preferred layout

Use `WORLD_HOME` to bind a named world:

```text
<world-home>/
  logs/
    witness-world.witnesses.jsonl
    witness-world.observations.jsonl
  runtime/
  backups/
  exports/
  imports/
```

For blank-world bootstrap, the same layout applies, with bootstrap-specific log filenames inside `logs/`.

### Lifecycle modes

- `warm`: named `WORLD_HOME` layout
- `cold`: fresh temp world-home created for bootstrap when no explicit paths are provided
- `warm-compatibility`: explicit `RUNTIME_ROOT` / `WITNESS_LOG` / `OBSERVATION_LOG` compatibility path
- `ephemeral`: legacy temp-root behavior for serve/MCP when no operator-owned root is declared

### Canonical versus derived data

Canonical truth:

- witness log
- observation log

Derived or rebuildable runtime data:

- runtime root
- assets
- blobs
- search indexes
- webhook payload storage

### Required operator flows

- warm restart
- cold start
- backup
- restore
- export
- import
- repair/rebuild of derived runtime data from canonical truth

### Current first-slice operator flows

The first operator slice is now shipped through one shared runtime operator service.

CLI surfaces:

- `node src/cli.js operator backup --world-home <path> [--label <text>] [--include-derived]`
- `node src/cli.js operator export --world-home <path> [--label <text>]`
- `node src/cli.js operator restore --world-home <path> --artifact <backup-id-or-dir> [--preserve-current]`
- `node src/cli.js operator import --world-home <path> --artifact <import-id-or-dir> [--preserve-current]`

Authenticated bootstrap surfaces:

- `GET /api/operator/state`
- `POST /api/operator/backups`
- `POST /api/operator/exports`
- `POST /api/operator/restores`
- `POST /api/operator/imports`

Artifact rules:

- `backup` snapshots the current world into `WORLD_HOME/backups/<artifact-id>/`
- `export` writes a portable canonical artifact into `WORLD_HOME/exports/<artifact-id>/`
- `restore` replaces the current world from a managed backup artifact
- `import` replaces the current world from a managed export artifact staged under `WORLD_HOME/imports/<artifact-id>/`

Current payload rules:

- backups always include canonical witness and observation logs
- backups may optionally include derived runtime payloads
- exports include canonical logs plus manifest only
- restore/import replace canonical truth first, then restore optional derived payloads when present
- canonical truth is hot-reloaded after replace; derived payload replacement may still truthfully report `restartRequired`

Current safety restrictions:

- mutating operator flows are enabled only for `world-home-v1`
- `warm-compatibility` and `ephemeral` startups remain compatibility paths, not first-class mutation targets
- bootstrap restore/import resolves only managed artifact ids inside the active `WORLD_HOME` operator directories
- current restore/import semantics are whole-world and replace-only; there is no merge mode in this slice
- `--preserve-current` or `preserveCurrent` creates a safety backup before destructive replacement

Current operator visibility:

- bootstrap state includes operator contract, managed artifact inventory, and recent operator activity
- runtime diagnostics expose whether operator mutation is enabled and why it may be disabled
- operator actions emit witnessed observations such as `operator.backup`, `operator.restore`, `operator.export`, and `operator.import`

---

## 3. Executable Extension Boundary

The executable boundary remains intentionally explicit.

### Current rule

- internal runtime bundles are the executable extension mechanism
- local plugin packages are metadata-first package manifests
- plugin packages may declare bundle bridges, but they do not directly execute arbitrary providers or register routes from manifest metadata alone

### Required package states

- `discovered`
- `compatible`
- `installable in principle`
- `executable`
- `requested`
- `active`
- `rejected`

### Hard rules

- no plugin package may auto-execute code as a side effect of discovery
- no plugin package may auto-register runtime routes from manifest metadata alone
- no plugin package may silently activate providers outside the explicit bundle bridge path

### Current operational caveats

- runner-authored runtime-plugin installs, startup-local operator overlays, and bootstrap review/detail reads are now real product seams, but reconcile and repair flows for broken authored installs are still missing
- the maintained demo now proves authored plugin composition on `minimal`, including `plugin.demo`; `handlerSet = "demo"` no longer activates `bundle-demo` by itself
- blank-world bootstrap/tutorial startup still remains a separate runtime-composition path rather than using the same narrowed baseline as the maintained demo

---

## 4. Ecosystem Trust and Compatibility

The ecosystem contract is now expected to surface provenance and trust directly.

### Package metadata to keep visible

- provenance source
- provenance origin
- channel
- trust state
- signature status
- compatible runtime profiles
- compatible shells
- runtime-version expectations when declared
- update channel when declared

### Current trust states

- `local`
- `authored-here`
- `imported`
- `unsigned`
- `reviewed`

### Current compatibility dimensions

- runtime profile
- shell availability
- plugin dependencies
- capability dependencies
- runtime-version expectations when declared

### Intentional non-goals for this slice

- remote package store
- signature enforcement
- auto-update machinery
- desktop packaging breadth

Those remain downstream of this contract work.
