# Witness Core Substrate

`witness-core` is the day-one live execution substrate. It is intentionally not a Wasm runtime yet.

It provides:

- a long-running Rust host
- polling file-watch over configured roots
- content-addressed generation records
- proof execution
- optional supervised app child process with restart
- optional Rust-owned public front door with rolling cutover and drain
- fixture-first soak telemetry with durable session replay
- local promotion and rollback
- append-only `.witness-core/events.jsonl`
- JSON and SSE status endpoints

The current mental model is:

- `witness-core` is the platform substrate and control plane
- Node currently runs app workers that can attach to or be supervised by the core
- `bootstrap` is the empty-platform bring-up path
- `engentus` is an example app fixture, not the platform identity

Canonical developer flows from the repository root:

```powershell
npm run bootstrap
npm run platform:core
npm run platform:supervised
npm run engentus
npm run engentus:mcp
```

Utility worker-only flows from the repository root:

```powershell
npm run utility:engentus-worker
```

Direct cargo invocation remains available:

```powershell
cargo run --manifest-path substrate\Cargo.toml -p witness-core -- --config witness-core-standalone.toml --addr 127.0.0.1:8788
```

Execution-boundary roadmap:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](../docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)

`npm run platform:core` starts the Rust substrate only. It does not launch an app worker.

`npm run platform:supervised` uses the checked-in development config in `witness-core.toml`, supervises the example app worker in transport-only mode, and exposes the supported public app surface through the Rust frontdoor at `http://127.0.0.1:3000`.

`npm run engentus` and `npm run engentus:core` now point at that Rust-supervised frontdoor path.

`npm run engentus:mcp` now also uses a checked-in Rust-supervised frontdoor config for the HTTP MCP surface, exposing the supported MCP ingress through the core at `http://127.0.0.1:8791/mcp/engentus_mcp` while keeping the Node worker on Rust-owned control transport with no Node HTTP listener.

`npm run bootstrap` and `npm run authoring:server` now also use checked-in Rust-supervised frontdoor configs for blank-world/bootstrap startup and authoring bootstrap startup, instead of launching a direct default-port Node listener as the primary convenience path.

If you want to run the example app separately against the core instead, keep the standalone core running and then start the app worker with:

```powershell
$env:WITNESS_CORE_URL = "http://127.0.0.1:8788"
$env:WITNESS_WORKER_PORT = "4011"
npm run utility:engentus-worker
```

That worker-only path is a development utility for attaching a Node runtime to an already-running core. It defaults the worker onto a private utility port instead of the public frontdoor port, and it is not the supported public ingress.

Endpoints:

- `GET /health`
- `GET /processes`
- `GET /soak`
- `POST /processes/restart`
- `POST /processes/stop`
- `POST /soak/start`
- `POST /soak/mark`
- `POST /soak/sample`
- `POST /soak/complete`
- `POST /soak/fail`
- `GET /generations`
- `GET /serving`
- `GET /generations/:id`
- `POST /generations/:id/promote`
- `POST /generations/:id/rollback`
- `POST /serving/live`
- `POST /serving/stable`
- `GET /capabilities/fs/read?path=...`
- `GET /capabilities/fs/stat?path=...`
- `PUT /capabilities/fs/write`
- `POST /capabilities/fs/patch`
- `GET /events`

Published source writes can include `expectedHash` in the JSON body for optimistic concurrency. When the current file hash does not match, `witness-core` returns `409` with `code: "WITNESS_CORE_SOURCE_CONFLICT"` plus the current hash and file metadata.

The checked-in supervised config now enables `[frontdoor]` by default. `witness-core` keeps the control plane on `--addr` and binds a separate public app listener that proxies to the active child runtime. Manual `POST /processes/restart` becomes a rolling cutover in that mode.

```toml
[frontdoor]
public_addr = "127.0.0.1:3000"
drain_timeout_ms = 15000
startup_cutover_timeout_ms = 45000
```

For standalone utility listeners, keep `--port` on the direct Node command. For supervised children behind the front door, use transport-only commands that do not interpolate a worker port:

```toml
[supervise]
command = "node src/cli.js utility-serve <app-root> --server app --runtime-profile authoring"
transport_only_runtime = true
restart_on_exit = true
restart_on_unhealthy = true
```

When `witness-core` supervises a Node runtime, the maintained checked-in configs now rely on the Rust-provided `WITNESS_RUNTIME_CONTROL_ADDR` socket instead of requiring `[supervise].control_url` for readiness, health, supervision, reload, or MCP ingress. Standalone utility commands can still bind a loopback listener, but the checked-in supervised control plane no longer depends on any Node HTTP listener.

```toml
[supervise]
health_interval_ms = 1000
health_timeout_ms = 5000
restart_on_unhealthy = true
degraded_grace_polls = 10
unhealthy_grace_polls = 3
```

Legacy `control_url`, `health_url`, and `reload_url` config fields still exist as compatibility fallback for older supervised setups, but the maintained checked-in configs now use the Rust-owned control socket path.
