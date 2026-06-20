# Tilth

Tilth is a **witnessed conversation catalogue**, authored as a witness-world app.
It reads your Claude Code conversations into a witnessed world, shows them in a
browser, and lets you mark the ones that matter to your **DESIRE**.

It is the first thing the `meta` project authored entirely inside the witnessed
world. The point of `meta` is to use witness-world / DESIRE to help its author
achieve their DESIRE; tilth is step one — get your own transcripts in front of
you and mark which ones relate to that pursuit.

This app lives in a clone of witness-world checked out on branch `tilth` (off
`loam`). Authoring happens here; the runtime is the surrounding repo.

---

## The membrane

The single organising idea. A line runs through the system:

- **Above the line (authored DESIRE, in-world):** the surface (the browser
  page), the routes, and the two processes that record witnesses. This is the
  `.wtoml` and the small projection/handler logic. It is the truth.
- **Below the line (boundary leaf, JS):** anything that touches the outside —
  the filesystem, the network. A DESIRE program cannot read a disk; the only
  door out is a host operation / handler. That door is the membrane.

Tilth keeps the filesystem entirely outside: the app never reads `~/.claude`.
An external reader (`meta/tilth-claude-code-daemon/`) does that and reports
across the membrane via HTTP. The world only ever *witnesses* what it is told.

---

## The witnessed model

Tenet (`https://github.com/aaron-alderman/witness-world/blob/tilth/README.md`):

> Things and relations are inert. Processes attempt change. **Witnesses record
> what happened.** Projections render meaning for a context.

Two core processes write, one projection reads:

- **`session.import`** — emits a witness creating the session as a thing, with
  provenance: `thing(id)`, `relation(id,"origin",author)`,
  `relation(id,"hasTitle",title)`, plus body `{title, preview, project,
  started, msgCount}`.
- **`session.markDesire`** — emits `relation(id,"relatesTo","DESIRE")`. This is
  the gesture: *"yes, that one is mine."* It is a witnessed change, not a
  mutable flag — provenance (who marked it) lives in the witness `actor`.
- **`sessions` projection** — folds the append-only log into the current set of
  sessions, preserving a DESIRE mark across a re-import.

Repo-location indexing adds request/result loops. Tilth can witness that a
known local session should be indexed, then the Claude Code daemon reads the
full local transcript and filesystem/git state before reporting discovered
repos back across the membrane. Tilth can also witness a manual repo-recognition
request for a user-entered path; `tilth-daemon` validates it with local `git`
without needing the Claude Code daemon.

Marking is idiomatic to witness-world precisely because it is witnessed: the
`actor` is who marked it, the `cause` chain is the provenance trail. "Cloned
locally but provenance still to the og" is not a feature bolted on — it falls
out of witnessing.

---

## Files

Authored DESIRE (in-world, above the membrane):

- `examples/tilth/app.wtoml` — manifest (imports common lib + backend + frontend)
- `examples/tilth/backend.wtoml` — server runner, routes, plugin install
- `examples/tilth/frontend.wtoml` — the browser surface (page, row card, steps)

Boundary leaf (JS, the only writers/readers of witnesses):

- `plugins/tilth/plugin.json` — plugin manifest (`plugin.tilth` / `bundle-tilth`)
- `plugins/tilth/runtime.js` — bundle wiring (dispatch handlers)
- `plugins/tilth/tilth-sessions.js` — session processes, repo-index request
  processes, and projections
- `store/seeds/first-party-plugin-catalog.json` — registers `plugin.tilth`

---

## The membrane API (what crosses the line)

| method | route                      | handler              | purpose                              |
| ------ | -------------------------- | -------------------- | ------------------------------------ |
| GET    | `/`                        | `page.home`          | the browser surface                  |
| GET    | `/api/sessions`            | `sessions.read`      | the projection as JSON               |
| POST   | `/api/sessions`            | `session.import`     | import one session (daemon → world)  |
| POST   | `/api/sessions/:id/desire` | `session.markDesire` | mark a session DESIRE-related        |
| POST   | `/api/sessions/:id/transcript-preview/request` | `session.transcriptPreview.request` | request readable transcript text |
| GET    | `/api/transcript-preview/requests` | `transcriptPreview.requests.read` | pending transcript-preview work queue |
| POST   | `/api/transcript-preview/requests/:requestId/result` | `transcriptPreview.request.result` | daemon transcript-preview result |
| POST   | `/api/sessions/:id/repo-index/request` | `session.repoIndex.request` | request repo-location indexing |
| GET    | `/api/repo-index/requests` | `repoIndex.requests.read` | pending daemon work queue |
| GET    | `/api/repo-index/repos` | `repoIndex.repos.read` | repo-centric projection with sessions |
| POST   | `/api/repo-index/requests/:requestId/result` | `repoIndex.request.result` | daemon repo-index result |
| POST   | `/api/repos/recognitions/request` | `repo.recognition.request` | manually request repo recognition for a local path |
| GET    | `/api/repos/recognitions/requests` | `repoRecognition.requests.read` | pending manual repo-recognition work queue |
| POST   | `/api/repos/recognitions/requests/:requestId/result` | `repoRecognition.request.result` | manual repo-recognition result |
| POST   | `/api/repos/:repoId/snapshot/request` | `repo.snapshot.request` | request a local prepared repo snapshot |
| POST   | `/api/repo-snapshot/request` | `repo.snapshot.request` | body-based snapshot request for slash-containing repo ids |
| GET    | `/api/repo-snapshot/requests` | `repoSnapshot.requests.read` | pending repo-snapshot work queue |
| POST   | `/api/repo-snapshot/requests/:requestId/result` | `repoSnapshot.request.result` | repo-snapshot daemon result |
| POST   | `/api/sessions/:id/ai-summary/request` | `session.aiSummary.request` | request an AI summary for a DESIRE session |
| GET    | `/api/ai-summary/requests` | `aiSummary.requests.read` | pending AI-summary work queue |
| POST   | `/api/ai-summary/requests/:requestId/result` | `aiSummary.request.result` | AI-summary daemon result |

Import payload: `{ id, title, preview, project, origin, started, msgCount }`.
Import is **idempotent on content** — the same title/preview/msgCount is a
no-op; a change (e.g. a sanitization fix) re-witnesses an update, and the
projection preserves the DESIRE mark across it.

Transcript-preview result payload:
`{ status: "completed", text }` or `{ status: "failed", error }`. The daemon
recovers only the active Claude Code JSONL path and sanitizes local roots before
posting the text.

Repo-index result payload:
`{ status: "completed", repos: [{ root, name, mentions: [{ path, raw, role, timestamp }] }] }`
or `{ status: "failed", error }`. Paths are absolute in v1.

Manual repo-recognition result payload:
`{ status: "completed", root, name, remotes: [{ name, url }] }` or
`{ status: "failed", error }`. The repo projection merges manual recognition
with Claude-daemon session indexing by canonical repo root and shows both
sources when both have happened.

Repo-snapshot result payload:
`{ status: "completed", snapshotId, repoName, remote, fileCount }` or
`{ status: "failed", error }`. Tilth witnesses only the manifest. Source file
contents stay in `tilth-daemon`'s local cache for `tilth-net-daemon` to sign and
publish.

AI-summary result payload:
`{ status: "completed", text, bullets }` or `{ status: "failed", error }`.
The summary daemon only sees sessions explicitly requested from the browser; it
uses the sanitized transcript preview already witnessed by Tilth.

---

## Run

From the repo root
(the `witness-world--tilth` checkout):

```bash
node src/cli.js serve examples/tilth --runtime-profile minimal \
  --world-home "$PWD/.tilth-world" --port 3000
# then open http://localhost:3000/
```

The local workbench uses two boundary daemons:

```bash
# From meta/tilth-claude-code-daemon:
node index.mjs --watch

# From meta/tilth-daemon, after filling .env:
node --env-file=.env index.mjs --watch
```

`tilth-claude-code-daemon` reads `~/.claude`, imports sessions, and handles
session transcript-preview and session repo-index requests. `tilth-daemon`
handles manual repo recognition, local repo snapshot preparation, and AI-summary
requests; it sends selected DESIRE transcript preview text to the configured
OpenAI-compatible API only after the browser `Summarize` button creates a
request.

- `--runtime-profile minimal` is deliberate: the `full` profile pulls in
  `plugin.sql` / `plugin.sqlite`, which need `node:sqlite` — unavailable in the
  current Node build, and a fatal load error. Minimal + the app-scoped
  `plugin.tilth` install is all tilth needs.
- `--world-home` makes the witness log persist (warm start replays it). Without
  it the world is ephemeral and lost on restart.

---

## Current state and rough edges

- **Provenance actor is `backendHost`** — there is no sign-in yet, so anonymous
  requests fall back to the host. Real per-user provenance (`markedBy: callan`)
  is a clean follow-on via identity, and it is what the shared/remote direction
  needs (see `DIRECTION.md`).
- **Sanitization happens in the daemon**, before import, so the user's
  filesystem root never enters the witness log. See the daemon docs.
- **Preview + cards** reuse the base surface kit classes (`surface-card`,
  `surface-list`, `surface-lede`) — no core CSS changes.

For where this is going — the remote/shared world, "Mark DESIRE" as a publish
signal, and authoring the infrastructure itself in DESIRE — see
[`DIRECTION.md`](./DIRECTION.md).
