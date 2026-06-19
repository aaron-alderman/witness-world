# Loam

> DESIRE: *Drop Each Stone; Intent Renders Evidence.*

Loam is the engine for flavored todo apps, built on the witness-world substrate.
A todo is a declared desire; doing it is a process; the doing leaves a witness;
the list is a projection. This directory is the **first stone**: the seam proven
end to end, with the first flavor — **Hearth** (chores).

## What's here (and what's proven)

```
phone/browser (shell)            loam (the world)
  reads  GET /surface  <─────────  surface tree   (authored vocabulary, no DOM)
  reads  GET /data     <─────────  projection      (open chores, from the log)
  sends  POST /intent  ─────────>  process -> WITNESS -> new projection
```

- `world.js` — the chore domain on the **real witness kernel** (`../src/kernel.js`).
  Adding a chore appends a `chore.add` witness; completing one appends a
  *separate* `chore.done` witness. Nothing is ever mutated. The open list is
  `choreList()`, a pure projection over the append-only log.
- `surface.js` — **the clean surface seam.** Hearth authored in a tiny
  platform-agnostic vocabulary (`screen / group / text / list / field / action`).
  No HTML, no inline styles — just intent. This is the net-new piece that lets a
  non-DOM shell (React Native) render the same app a browser does.
- `server.js` — the seam over HTTP (`/surface`, `/data`, `/intent`) plus a
  ~60-line **generic browser shell** that renders the vocabulary. It knows the
  vocabulary, not chores.
- `prove.mjs` — headless proof of the loop and its invariants.

## Run

```bash
node examples/loam/prove.mjs   # headless: prove the witness/projection loop
node examples/loam/server.js   # serve the seam + browser shell on :4500
# then open http://<your-lan-ip>:4500 on a phone on the same wifi
```

## Deliberately deferred (the honest frontier)

- **React Native shell.** The browser renderer here *is* the shell, proving the
  vocabulary is renderer-agnostic. The RN shell is the same `render(node, data)`
  in native widgets — mechanical once the wire holds, but it needs Expo + a
  device, so it's the next stone, not this one.
- **Authored in real DESIRE.** The world is kernel-direct for now (real
  witnesses, real projections) — not yet `.rvm`-authored surface/process/
  projection. Migrating it into DESIRE is the path, not a shortcut around it.
- **Live delivery (SSE/push), identity/auth, off-wifi reach.** All later tiers.
  Today: pull, LAN-trust, claimed actor (`?who=callan`).

## Why it's shaped this way

The boundary is the filesystem: this world is tracked; produced apps and external
shells live under `repos/**` (gitignored). Loam *produces* a flavor by stamping a
shell into `repos/<flavor>/` — it does not generate app code. One engine, many
named gardens; Hearth is the first.
