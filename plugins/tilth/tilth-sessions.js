// Tilth: the witnessed conversation-catalogue.
//
// This is the boundary leaf. The .wtoml authors the browser surface, routes and
// page; this file is the thin JS that (a) emits witnesses through the two
// processes and (b) folds the witness log into the `sessions` projection.
//
// Tenet (README): "Processes attempt change. Witnesses record what happened.
// Projections render meaning for a context." Every mark/import is one witness;
// provenance lives in the witness `actor` + claims, never in a mutable flag.

import { thing, relation } from "../../src/projectors-core.js";

// --- projection -----------------------------------------------------------
// Fold every witness into the current set of known sessions. Two processes
// contribute: session.import (creates the thing + provenance) and
// session.markDesire (asserts the relatesTo:DESIRE relation).
export function projectSessions(witnesses) {
  const sessions = new Map();
  const repoIndexBySession = projectLatestRepoIndexBySession(witnesses);
  const transcriptPreviewBySession = projectLatestTranscriptPreviewBySession(witnesses);
  const aiSummaryBySession = projectLatestAiSummaryBySession(witnesses);
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const id = body.id;
    if (!id) continue;

    if (witness.process === "session.import") {
      const existing = sessions.get(id);
      sessions.set(id, {
        id,
        title: String(body.title || ""),
        preview: String(body.preview || ""),
        origin: String(body.origin || ""),
        project: String(body.project || ""),
        started: String(body.started || ""),
        msgCount: Number.isFinite(Number(body.msgCount)) ? Number(body.msgCount) : 0,
        importedBy: witness.actor || null,
        // marks survive a re-import of the same session
        desire: existing ? existing.desire : false,
        markedBy: existing ? existing.markedBy : null,
        repoIndex: repoIndexBySession.get(id) ?? emptyRepoIndex(),
        transcriptPreview: transcriptPreviewBySession.get(id) ?? emptyTranscriptPreview(),
        aiSummary: aiSummaryBySession.get(id) ?? emptyAiSummary()
      });
      continue;
    }

    if (witness.process === "session.markDesire" && sessions.has(id)) {
      const current = sessions.get(id);
      sessions.set(id, { ...current, desire: true, markedBy: witness.actor || null });
    }
  }

  return [...sessions.values()].sort((a, b) => {
    // newest first by start time, then id for stability
    const t = String(b.started).localeCompare(String(a.started));
    if (t !== 0) return t;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function projectFilteredSessions(witnesses, filter = "") {
  const normalized = normalizeFilter(filter);
  const sessions = projectSessions(witnesses);
  if (normalized === "desire") return sessions.filter(session => session.desire === true);
  if (normalized === "indexed") return sessions.filter(session => session.repoIndex?.status === "completed");
  return sessions;
}

export function projectRepoIndexRequests(witnesses) {
  const requests = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const requestId = stringOrNull(body.requestId);
    if (!requestId) continue;

    if (witness.process === "session.repoIndex.requested") {
      requests.set(requestId, {
        requestId,
        sessionId: String(body.sessionId || body.id || ""),
        status: "pending",
        requestedBy: witness.actor || null,
        requestedAt: witness.at || null,
        completedBy: null,
        completedAt: null,
        repos: [],
        error: null
      });
      continue;
    }

    if (witness.process === "session.repoIndex.completed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "completed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        repos: normalizeRepos(body.repos),
        error: null
      });
      continue;
    }

    if (witness.process === "session.repoIndex.failed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "failed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        repos: [],
        error: String(body.error || body.reason || "repo index failed")
      });
    }
  }

  return [...requests.values()].sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
}

export function projectTranscriptPreviewRequests(witnesses) {
  const requests = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const requestId = stringOrNull(body.requestId);
    if (!requestId) continue;

    if (witness.process === "session.transcriptPreview.requested") {
      requests.set(requestId, {
        requestId,
        sessionId: String(body.sessionId || body.id || ""),
        status: "pending",
        requestedBy: witness.actor || null,
        requestedAt: witness.at || null,
        completedBy: null,
        completedAt: null,
        text: "",
        error: null
      });
      continue;
    }

    if (witness.process === "session.transcriptPreview.completed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "completed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        text: String(body.text || ""),
        error: null
      });
      continue;
    }

    if (witness.process === "session.transcriptPreview.failed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "failed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        text: "",
        error: String(body.error || body.reason || "transcript preview failed")
      });
    }
  }

  return [...requests.values()].sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
}

export function projectAiSummaryRequests(witnesses) {
  const transcriptPreviewBySession = projectLatestTranscriptPreviewBySession(witnesses);
  const requests = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const requestId = stringOrNull(body.requestId);
    if (!requestId) continue;

    if (witness.process === "session.aiSummary.requested") {
      const sessionId = String(body.sessionId || body.id || "");
      const transcriptPreview = transcriptPreviewBySession.get(sessionId) ?? emptyTranscriptPreview();
      requests.set(requestId, {
        requestId,
        sessionId,
        status: transcriptPreview.text ? "pending" : "waiting_for_transcript",
        requestedBy: witness.actor || null,
        requestedAt: witness.at || null,
        completedBy: null,
        completedAt: null,
        transcriptPreviewRequestId: transcriptPreview.requestId,
        transcriptText: transcriptPreview.text,
        text: "",
        bullets: [],
        error: null
      });
      continue;
    }

    if (witness.process === "session.aiSummary.completed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "completed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        text: String(body.text || ""),
        bullets: normalizeStringList(body.bullets),
        error: null
      });
      continue;
    }

    if (witness.process === "session.aiSummary.failed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "failed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        text: "",
        bullets: [],
        error: String(body.error || body.reason || "AI summary failed")
      });
    }
  }

  return [...requests.values()].sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
}

export function projectRepoIndexRepos(witnesses, options = {}) {
  const filter = normalizeFilter(options?.filter);
  const repos = new Map();
  for (const session of projectFilteredSessions(witnesses, filter)) {
    if (session.repoIndex?.status !== "completed") continue;
    for (const repo of normalizeRepos(session.repoIndex.repos)) {
      const current = repos.get(repo.root) ?? {
        root: repo.root,
        name: repo.name,
        remotes: repo.remotes,
        sessionCount: 0,
        mentionCount: 0,
        sessions: []
      };
      const mentionCount = repo.mentions.length;
      current.sessionCount++;
      current.mentionCount += mentionCount;
      current.sessions.push({
        id: session.id,
        title: session.title || session.id,
        project: session.project,
        started: session.started,
        mentionCount,
        mentionText: countText(mentionCount, "mention"),
        paths: repo.mentions.map(mention => mention.path),
        pathText: repo.mentions.map(mention => mention.path).join(", "),
        displayPaths: displayPathItems(repo.root, repo.mentions.map(mention => mention.path))
      });
      repos.set(repo.root, current);
    }
  }

  return [...repos.values()]
    .map(repo => {
      const pathItems = displayPathItems(repo.root, repo.sessions.flatMap(session => session.paths));
      const previewItems = pathItems.slice(0, 5);
      const hiddenPathCount = Math.max(0, pathItems.length - previewItems.length);
      return {
        ...repo,
        displayRoot: displayRepoRoot(repo.root),
        remoteText: remoteText(repo.remotes),
        mentionText: countText(repo.mentionCount, "mention"),
        sessionText: repo.sessions
          .map(session => `From: ${session.title} · ${session.mentionText}`)
          .join(" | "),
        pathItems,
        pathPreviewText: previewItems.join(", ") + (hiddenPathCount ? `, +${hiddenPathCount} more` : ""),
        pathDetailText: pathItems.join("\n"),
        hiddenPathCount,
        pathText: repo.sessions
          .flatMap(session => session.paths)
          .filter(Boolean)
          .join(", ")
      };
    })
    .sort((a, b) => b.sessionCount - a.sessionCount || b.mentionCount - a.mentionCount || a.root.localeCompare(b.root));
}

function remoteText(remotes) {
  const rows = Array.isArray(remotes) ? remotes : [];
  if (!rows.length) return "";
  return rows.map(remote => `${remote.name}: ${remote.url}`).join(" | ");
}

function countText(count, singular) {
  const number = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${number} ${singular}${number === 1 ? "" : "s"}`;
}

function normalizeFilter(value) {
  const filter = String(value || "").trim().toLowerCase();
  return filter === "desire" || filter === "indexed" ? filter : "";
}

function displayRepoRoot(root) {
  const text = String(root || "");
  const marker = "/repos/ai/repos/";
  const index = text.indexOf(marker);
  if (index >= 0) return text.slice(index + marker.length);
  return text.replace(/^\/home\/[^/]+\//, "~/");
}

function displayPathItems(repoRoot, paths) {
  const root = String(repoRoot || "").replace(/\/+$/, "");
  const seen = new Set();
  const out = [];
  for (const path of Array.isArray(paths) ? paths : []) {
    const value = String(path || "");
    if (!value || isNoisyDisplayPath(value)) continue;
    let display = value;
    if (root && (value === root || value.startsWith(`${root}/`))) {
      display = value === root ? "repo root" : value.slice(root.length + 1);
    }
    if (!display || isNoisyDisplayPath(display) || seen.has(display)) continue;
    seen.add(display);
    out.push(display);
  }
  return out;
}

function isNoisyDisplayPath(path) {
  return /(^|\/)(node_modules|\.git|\.cache|dist|build|coverage|\.next|\.expo)(\/|$)/.test(String(path || ""));
}

function projectLatestRepoIndexBySession(witnesses) {
  const bySession = new Map();
  for (const request of projectRepoIndexRequests(witnesses)) {
    const current = bySession.get(request.sessionId);
    if (!current || String(request.requestedAt || "") >= String(current.requestedAt || "")) {
      bySession.set(request.sessionId, repoIndexReadShape(request));
    }
  }
  return bySession;
}

function projectLatestTranscriptPreviewBySession(witnesses) {
  const bySession = new Map();
  for (const request of projectTranscriptPreviewRequests(witnesses)) {
    const current = bySession.get(request.sessionId);
    if (!current || String(request.requestedAt || "") >= String(current.requestedAt || "")) {
      bySession.set(request.sessionId, transcriptPreviewReadShape(request));
    }
  }
  return bySession;
}

function projectLatestAiSummaryBySession(witnesses) {
  const bySession = new Map();
  for (const request of projectAiSummaryRequests(witnesses)) {
    const current = bySession.get(request.sessionId);
    if (!current || String(request.requestedAt || "") >= String(current.requestedAt || "")) {
      bySession.set(request.sessionId, aiSummaryReadShape(request));
    }
  }
  return bySession;
}

function transcriptPreviewReadShape(request) {
  return {
    status: request.status,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    text: String(request.text || ""),
    error: request.error,
    summary: transcriptPreviewSummary(request)
  };
}

function aiSummaryReadShape(request) {
  const bullets = normalizeStringList(request.bullets);
  return {
    status: request.status,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    text: String(request.text || ""),
    bullets,
    bulletText: bullets.map(item => `- ${item}`).join("\n"),
    error: request.error,
    errorText: request.error ? `Error: ${request.error}` : "",
    summary: aiSummarySummary(request)
  };
}

function emptyAiSummary() {
  return {
    status: "not_requested",
    requestId: null,
    requestedAt: null,
    completedAt: null,
    text: "",
    bullets: [],
    bulletText: "",
    error: null,
    errorText: "",
    summary: "AI summary not run"
  };
}

function aiSummarySummary(request) {
  if (request.status === "waiting_for_transcript") return "Waiting for transcript preview";
  if (request.status === "pending") return "AI summary pending";
  if (request.status === "failed") return "AI summary failed";
  if (request.status !== "completed") return "AI summary not run";
  return request.text || request.bullets.length ? "AI summary loaded" : "AI summary is empty";
}

function emptyTranscriptPreview() {
  return {
    status: "not_requested",
    requestId: null,
    requestedAt: null,
    completedAt: null,
    text: "",
    error: null,
    summary: "Transcript preview not loaded"
  };
}

function transcriptPreviewSummary(request) {
  if (request.status === "pending") return "Transcript preview pending";
  if (request.status === "failed") return `Transcript preview failed: ${request.error || "unknown error"}`;
  if (request.status !== "completed") return "Transcript preview not loaded";
  return request.text ? "Transcript preview loaded" : "Transcript preview is empty";
}

function repoIndexReadShape(request) {
  const repos = normalizeRepos(request.repos);
  const mentionCount = repos.reduce((sum, repo) => sum + repo.mentions.length, 0);
  return {
    status: request.status,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    repoCount: repos.length,
    mentionCount,
    repos,
    error: request.error,
    summary: repoIndexSummary({ ...request, repos })
  };
}

function emptyRepoIndex() {
  return {
    status: "not_requested",
    requestId: null,
    requestedAt: null,
    completedAt: null,
    repoCount: 0,
    mentionCount: 0,
    repos: [],
    error: null,
    summary: "Repo index not run"
  };
}

function repoIndexSummary(request) {
  if (request.status === "pending") return "Repo index pending";
  if (request.status === "failed") return `Repo index failed: ${request.error || "unknown error"}`;
  if (request.status !== "completed") return "Repo index not run";
  if (!request.repos.length) return "No mentioned git repos found";
  return request.repos
    .map(repo => `${repo.name || displayRepoRoot(repo.root)}: ${repo.mentions.length} mentions`)
    .join(" | ");
}

// --- processes (the only writers) -----------------------------------------
export function requestSessionImport(world, { actor, backendHost, body }) {
  const id = stringOrNull(body?.id);
  if (!id) return { ok: false, status: 400, error: "id is required" };

  const title = String(body?.title || "");
  const preview = String(body?.preview || "");
  const origin = String(body?.origin || actor || backendHost || "");
  const project = String(body?.project || "");
  const started = String(body?.started || "");
  const msgCount = Number.isFinite(Number(body?.msgCount)) ? Number(body.msgCount) : 0;

  // Idempotent on CONTENT: skip only when the known session already carries the
  // same title/preview/msgCount. If any changed (e.g. a sanitization fix, or a
  // grown conversation), re-witness an update — the projection preserves the
  // DESIRE mark across re-import, so marks are never lost.
  const existing = projectSessions(world.allWitnesses()).find(s => s.id === id);
  if (existing
    && existing.title === title
    && existing.preview === preview
    && existing.msgCount === msgCount) {
    return { ok: true, status: 200, skipped: true, id };
  }

  const witness = world.emit({
    process: "session.import",
    actor: actor || backendHost,
    claims: [
      thing(id),
      relation(id, "origin", origin),
      relation(id, "hasTitle", title)
    ],
    body: { id, title, preview, origin, project, started, msgCount }
  });
  return { ok: true, status: 201, id, witness };
}

export function requestSessionMarkDesire(world, { actor, backendHost, id }) {
  const sid = stringOrNull(id);
  if (!sid) return { ok: false, status: 400, error: "id is required" };

  const known = projectSessions(world.allWitnesses()).find(s => s.id === sid);
  if (!known) return { ok: false, status: 404, error: "unknown session" };

  const witness = world.emit({
    process: "session.markDesire",
    actor: actor || backendHost,
    claims: [relation(sid, "relatesTo", "DESIRE")],
    body: { id: sid }
  });
  return { ok: true, status: 200, id: sid, witness };
}

export function requestSessionRepoIndex(world, { actor, backendHost, id }) {
  const sid = stringOrNull(id);
  if (!sid) return { ok: false, status: 400, error: "id is required" };

  const known = projectSessions(world.allWitnesses()).find(s => s.id === sid);
  if (!known) return { ok: false, status: 404, error: "unknown session" };

  const requestId = `repoIndex.${sid.replace(/[^A-Za-z0-9_.-]/g, "_")}.${world.allWitnesses().length + 1}`;
  const witness = world.emit({
    process: "session.repoIndex.requested",
    actor: actor || backendHost,
    claims: [
      relation(sid, "hasRepoIndexRequest", requestId),
      relation(requestId, "targetsSession", sid)
    ],
    body: { requestId, sessionId: sid, id: sid }
  });
  return { ok: true, status: 202, requestId, sessionId: sid, witness };
}

export function requestSessionTranscriptPreview(world, { actor, backendHost, id }) {
  const sid = stringOrNull(id);
  if (!sid) return { ok: false, status: 400, error: "id is required" };

  const known = projectSessions(world.allWitnesses()).find(s => s.id === sid);
  if (!known) return { ok: false, status: 404, error: "unknown session" };

  const requestId = `transcriptPreview.${sid.replace(/[^A-Za-z0-9_.-]/g, "_")}.${world.allWitnesses().length + 1}`;
  const witness = world.emit({
    process: "session.transcriptPreview.requested",
    actor: actor || backendHost,
    claims: [
      relation(sid, "hasTranscriptPreviewRequest", requestId),
      relation(requestId, "targetsSession", sid)
    ],
    body: { requestId, sessionId: sid, id: sid }
  });
  return { ok: true, status: 202, requestId, sessionId: sid, witness };
}

export function requestSessionAiSummary(world, { actor, backendHost, id }) {
  const sid = stringOrNull(id);
  if (!sid) return { ok: false, status: 400, error: "id is required" };

  const known = projectSessions(world.allWitnesses()).find(s => s.id === sid);
  if (!known) return { ok: false, status: 404, error: "unknown session" };
  if (!known.desire) return { ok: false, status: 409, error: "session is not marked DESIRE" };

  const requestId = `aiSummary.${sid.replace(/[^A-Za-z0-9_.-]/g, "_")}.${world.allWitnesses().length + 1}`;
  const witness = world.emit({
    process: "session.aiSummary.requested",
    actor: actor || backendHost,
    claims: [
      relation(sid, "hasAiSummaryRequest", requestId),
      relation(requestId, "targetsSession", sid)
    ],
    body: { requestId, sessionId: sid, id: sid }
  });
  return { ok: true, status: 202, requestId, sessionId: sid, witness };
}

export function completeSessionRepoIndex(world, { actor, backendHost, body }) {
  const requestId = stringOrNull(body?.requestId);
  if (!requestId) return { ok: false, status: 400, error: "requestId is required" };

  const request = projectRepoIndexRequests(world.allWitnesses()).find(row => row.requestId === requestId);
  if (!request) return { ok: false, status: 404, error: "unknown repo index request" };
  if (request.status !== "pending") return { ok: true, status: 200, skipped: true, requestId, sessionId: request.sessionId };

  const status = String(body?.status || "").toLowerCase();
  if (status === "failed") {
    const witness = world.emit({
      process: "session.repoIndex.failed",
      actor: actor || backendHost,
      claims: [relation(requestId, "repoIndexStatus", "failed")],
      body: {
        requestId,
        sessionId: request.sessionId,
        error: String(body?.error || "repo index failed")
      }
    });
    return { ok: true, status: 200, requestId, sessionId: request.sessionId, witness };
  }

  const repos = normalizeRepos(body?.repos);
  const witness = world.emit({
    process: "session.repoIndex.completed",
    actor: actor || backendHost,
    claims: [
      relation(requestId, "repoIndexStatus", "completed"),
      relation(request.sessionId, "hasRepoIndexResult", requestId)
    ],
    body: {
      requestId,
      sessionId: request.sessionId,
      repos
    }
  });
  return { ok: true, status: 200, requestId, sessionId: request.sessionId, repos, witness };
}

export function completeSessionTranscriptPreview(world, { actor, backendHost, body }) {
  const requestId = stringOrNull(body?.requestId);
  if (!requestId) return { ok: false, status: 400, error: "requestId is required" };

  const request = projectTranscriptPreviewRequests(world.allWitnesses()).find(row => row.requestId === requestId);
  if (!request) return { ok: false, status: 404, error: "unknown transcript preview request" };
  if (request.status !== "pending") return { ok: true, status: 200, skipped: true, requestId, sessionId: request.sessionId };

  const status = String(body?.status || "").toLowerCase();
  if (status === "failed") {
    const witness = world.emit({
      process: "session.transcriptPreview.failed",
      actor: actor || backendHost,
      claims: [relation(requestId, "transcriptPreviewStatus", "failed")],
      body: {
        requestId,
        sessionId: request.sessionId,
        error: String(body?.error || "transcript preview failed")
      }
    });
    return { ok: true, status: 200, requestId, sessionId: request.sessionId, witness };
  }

  const text = String(body?.text || "");
  const witness = world.emit({
    process: "session.transcriptPreview.completed",
    actor: actor || backendHost,
    claims: [
      relation(requestId, "transcriptPreviewStatus", "completed"),
      relation(request.sessionId, "hasTranscriptPreviewResult", requestId)
    ],
    body: {
      requestId,
      sessionId: request.sessionId,
      text
    }
  });
  return { ok: true, status: 200, requestId, sessionId: request.sessionId, text, witness };
}

export function completeSessionAiSummary(world, { actor, backendHost, body }) {
  const requestId = stringOrNull(body?.requestId);
  if (!requestId) return { ok: false, status: 400, error: "requestId is required" };

  const request = projectAiSummaryRequests(world.allWitnesses()).find(row => row.requestId === requestId);
  if (!request) return { ok: false, status: 404, error: "unknown AI summary request" };
  if (request.status === "completed" || request.status === "failed") {
    return { ok: true, status: 200, skipped: true, requestId, sessionId: request.sessionId };
  }

  const status = String(body?.status || "").toLowerCase();
  if (status === "failed") {
    const witness = world.emit({
      process: "session.aiSummary.failed",
      actor: actor || backendHost,
      claims: [relation(requestId, "aiSummaryStatus", "failed")],
      body: {
        requestId,
        sessionId: request.sessionId,
        error: String(body?.error || "AI summary failed")
      }
    });
    return { ok: true, status: 200, requestId, sessionId: request.sessionId, witness };
  }

  const text = String(body?.text || "");
  const bullets = normalizeStringList(body?.bullets);
  const witness = world.emit({
    process: "session.aiSummary.completed",
    actor: actor || backendHost,
    claims: [
      relation(requestId, "aiSummaryStatus", "completed"),
      relation(request.sessionId, "hasAiSummaryResult", requestId)
    ],
    body: {
      requestId,
      sessionId: request.sessionId,
      text,
      bullets
    }
  });
  return { ok: true, status: 200, requestId, sessionId: request.sessionId, text, bullets, witness };
}

// --- handler registration (eden dispatch-handler pattern) -----------------
export function createTilthHandlers({ world, backendHost, sendJson, readJson }) {
  return {
    "sessions.read": async ({ req, res }) => {
      sendJson(res, 200, { sessions: projectFilteredSessions(world.allWitnesses(), requestFilter(req)) });
    },

    "session.import": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const result = requestSessionImport(world, { actor: requestActor, backendHost, body });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    },

    "session.markDesire": async ({ res, requestActor, params }) => {
      const result = requestSessionMarkDesire(world, {
        actor: requestActor,
        backendHost,
        id: params?.id || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, id: result.id, witness: result.witness });
    },

    "session.repoIndex.request": async ({ res, requestActor, params }) => {
      const result = requestSessionRepoIndex(world, {
        actor: requestActor,
        backendHost,
        id: params?.id || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, requestId: result.requestId, sessionId: result.sessionId, witness: result.witness });
    },

    "session.transcriptPreview.request": async ({ res, requestActor, params }) => {
      const result = requestSessionTranscriptPreview(world, {
        actor: requestActor,
        backendHost,
        id: params?.id || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, requestId: result.requestId, sessionId: result.sessionId, witness: result.witness });
    },

    "session.aiSummary.request": async ({ res, requestActor, params }) => {
      const result = requestSessionAiSummary(world, {
        actor: requestActor,
        backendHost,
        id: params?.id || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, requestId: result.requestId, sessionId: result.sessionId, witness: result.witness });
    },

    "transcriptPreview.requests.read": async ({ res }) => {
      const requests = projectTranscriptPreviewRequests(world.allWitnesses()).filter(request => request.status === "pending");
      sendJson(res, 200, { requests });
    },

    "aiSummary.requests.read": async ({ res }) => {
      const requests = projectAiSummaryRequests(world.allWitnesses()).filter(request => request.status === "pending");
      sendJson(res, 200, { requests });
    },

    "repoIndex.requests.read": async ({ res }) => {
      const requests = projectRepoIndexRequests(world.allWitnesses()).filter(request => request.status === "pending");
      sendJson(res, 200, { requests });
    },

    "repoIndex.repos.read": async ({ req, res }) => {
      sendJson(res, 200, { repos: projectRepoIndexRepos(world.allWitnesses(), { filter: requestFilter(req) }) });
    },

    "repoIndex.request.result": async ({ req, res, requestActor, params }) => {
      const body = await readJson(req);
      const result = completeSessionRepoIndex(world, {
        actor: requestActor,
        backendHost,
        body: { ...body, requestId: params?.requestId || body?.requestId }
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    },

    "transcriptPreview.request.result": async ({ req, res, requestActor, params }) => {
      const body = await readJson(req);
      const result = completeSessionTranscriptPreview(world, {
        actor: requestActor,
        backendHost,
        body: { ...body, requestId: params?.requestId || body?.requestId }
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    },

    "aiSummary.request.result": async ({ req, res, requestActor, params }) => {
      const body = await readJson(req);
      const result = completeSessionAiSummary(world, {
        actor: requestActor,
        backendHost,
        body: { ...body, requestId: params?.requestId || body?.requestId }
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    }
  };
}

function stringOrNull(value) {
  if (typeof value !== "string") return value == null ? null : String(value).trim() || null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requestFilter(req) {
  try {
    const url = new URL(req?.url || "", "http://tilth.local");
    return url.searchParams.get("filter") || "";
  } catch {
    return "";
  }
}

function normalizeRepos(value) {
  if (!Array.isArray(value)) return [];
  return value.map(repo => {
    const root = String(repo?.root || "");
    const name = String(repo?.name || root.split(/[\\/]/).filter(Boolean).at(-1) || root);
    const remotes = Array.isArray(repo?.remotes)
      ? repo.remotes.map(remote => ({
        name: String(remote?.name || ""),
        url: String(remote?.url || "")
      })).filter(remote => remote.name && remote.url)
      : [];
    const mentions = Array.isArray(repo?.mentions)
      ? repo.mentions.map(mention => ({
        path: String(mention?.path || ""),
        raw: String(mention?.raw || mention?.path || ""),
        role: String(mention?.role || ""),
        timestamp: String(mention?.timestamp || "")
      })).filter(mention => mention.path)
      : [];
    return { root, name, remotes, mentions };
  }).filter(repo => repo.root);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || "").trim()).filter(Boolean);
}
