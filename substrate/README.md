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

Run from the repository root:

```powershell
cargo run --manifest-path substrate\Cargo.toml -p witness-core -- --config witness-core.toml --addr 127.0.0.1:8788
```

With the default `witness-core.toml`, `witness-core` will also start `npm run engentus` as a supervised child and inject `WITNESS_CORE_URL=http://127.0.0.1:8788`.

If you want to run the app separately instead, remove or blank the `[supervise]` section and then start the app with:

```powershell
$env:WITNESS_CORE_URL = "http://127.0.0.1:8788"
npm run engentus
```

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

When `[frontdoor]` is configured, `witness-core` keeps the control plane on `--addr` and also binds a separate public app listener that proxies to the active child runtime. Manual `POST /processes/restart` becomes a rolling cutover in that mode.

```toml
[frontdoor]
public_addr = "127.0.0.1:3000"
drain_timeout_ms = 15000
startup_cutover_timeout_ms = 45000
```

For supervised children behind the front door, use command and health templates that let `witness-core` allocate a private loopback port per instance:

```toml
[supervise]
command = "node src/cli.js serve examples/engentus --server app --port {runtime_port} --runtime-profile authoring"
health_url = "http://127.0.0.1:{runtime_port}/api/runtime/process-health"
restart_on_exit = true
restart_on_unhealthy = true
```

When `witness-core` supervises a Node runtime, point `[supervise].health_url` at the structured runtime health endpoint:

```toml
[supervise]
health_url = "http://127.0.0.1:3000/api/runtime/process-health"
health_interval_ms = 1000
health_timeout_ms = 5000
restart_on_unhealthy = true
degraded_grace_polls = 10
unhealthy_grace_polls = 3
```
