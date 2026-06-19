# Witness Core Substrate

`witness-core` is the day-one live execution substrate. It is intentionally not a Wasm runtime yet.

It provides:

- a long-running Rust host
- polling file-watch over configured roots
- content-addressed generation records
- proof execution
- optional supervised app child process with restart
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
- `POST /processes/restart`
- `POST /processes/stop`
- `GET /generations`
- `GET /generations/:id`
- `POST /generations/:id/promote`
- `POST /generations/:id/rollback`
- `GET /events`
