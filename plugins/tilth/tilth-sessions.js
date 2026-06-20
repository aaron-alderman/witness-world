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

  return [...sessions.values()].map(enrichSessionDisplay).sort((a, b) => {
    // newest first by start time, then id for stability
    const t = String(b.started).localeCompare(String(a.started));
    if (t !== 0) return t;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function projectFilteredSessions(witnesses, filter = "", query = "") {
  const normalized = normalizeFilter(filter);
  const queryText = normalizeQuery(query);
  let sessions = projectSessions(witnesses);
  if (normalized === "desire") sessions = sessions.filter(session => session.desire === true);
  if (normalized === "indexed") sessions = sessions.filter(session => session.repoIndex?.status === "completed");
  if (queryText) sessions = sessions.filter(session => includesQuery(session.searchText, queryText));
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

export function projectRepoRecognitionRequests(witnesses) {
  const requests = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const requestId = stringOrNull(body.requestId);
    if (!requestId) continue;

    if (witness.process === "repo.recognition.requested") {
      requests.set(requestId, {
        requestId,
        path: String(body.path || ""),
        status: "pending",
        requestedBy: witness.actor || null,
        requestedAt: witness.at || null,
        completedBy: null,
        completedAt: null,
        root: "",
        name: "",
        remotes: [],
        error: null
      });
      continue;
    }

    if (witness.process === "repo.recognition.completed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      const repo = normalizeRepoRecord(body);
      requests.set(requestId, {
        ...current,
        status: "completed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        root: repo.root,
        name: repo.name,
        remotes: repo.remotes,
        error: null
      });
      continue;
    }

    if (witness.process === "repo.recognition.failed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "failed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        root: "",
        name: "",
        remotes: [],
        error: String(body.error || body.reason || "repo recognition failed")
      });
    }
  }

  return [...requests.values()].sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
}

export function projectRepoSnapshotRequests(witnesses) {
  const requests = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const requestId = stringOrNull(body.requestId);
    if (!requestId) continue;

    if (witness.process === "repo.snapshot.requested") {
      requests.set(requestId, {
        requestId,
        repoId: String(body.repoId || ""),
        root: String(body.root || ""),
        name: String(body.name || ""),
        status: "pending",
        requestedBy: witness.actor || null,
        requestedAt: witness.at || null,
        completedBy: null,
        completedAt: null,
        snapshotId: "",
        repoName: "",
        remote: "",
        fileCount: 0,
        error: null
      });
      continue;
    }

    if (witness.process === "repo.snapshot.completed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "completed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        snapshotId: String(body.snapshotId || ""),
        repoName: String(body.repoName || current.name || current.repoId),
        remote: String(body.remote || ""),
        fileCount: Number.isFinite(Number(body.fileCount)) ? Number(body.fileCount) : 0,
        error: null
      });
      continue;
    }

    if (witness.process === "repo.snapshot.failed" && requests.has(requestId)) {
      const current = requests.get(requestId);
      requests.set(requestId, {
        ...current,
        status: "failed",
        completedBy: witness.actor || null,
        completedAt: witness.at || null,
        snapshotId: "",
        repoName: "",
        remote: "",
        fileCount: 0,
        error: String(body.error || body.reason || "repo snapshot failed")
      });
    }
  }

  return [...requests.values()].sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
}

export function projectRepoIndexRepos(witnesses, options = {}) {
  const filter = normalizeFilter(options?.filter);
  const query = normalizeQuery(options?.query);
  const repos = new Map();
  const snapshotsByRoot = latestRepoSnapshotsByRoot(witnesses);
  for (const session of projectFilteredSessions(witnesses, filter)) {
    if (session.repoIndex?.status !== "completed") continue;
    for (const repo of normalizeRepos(session.repoIndex.repos)) {
      const current = repos.get(repo.root) ?? {
        root: repo.root,
        name: repo.name,
        remotes: repo.remotes,
        sessionCount: 0,
        mentionCount: 0,
        sessions: [],
        manualRecognitions: []
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

  for (const recognition of projectRepoRecognitionRequests(witnesses).filter(request => request.status === "completed")) {
    const current = repos.get(recognition.root) ?? {
      root: recognition.root,
      name: recognition.name,
      remotes: recognition.remotes,
      sessionCount: 0,
      mentionCount: 0,
      sessions: [],
      manualRecognitions: []
    };
    current.name = current.name || recognition.name;
    current.remotes = current.remotes?.length ? current.remotes : recognition.remotes;
    current.manualRecognitions.push({
      requestId: recognition.requestId,
      path: recognition.path,
      requestedBy: recognition.requestedBy,
      requestedAt: recognition.requestedAt,
      completedBy: recognition.completedBy,
      completedAt: recognition.completedAt
    });
    repos.set(recognition.root, current);
  }

  return [...repos.values()]
    .map(repo => {
      const pathItems = displayPathItems(repo.root, repo.sessions.flatMap(session => session.paths));
      const previewItems = pathItems.slice(0, 5);
      const hiddenPathCount = Math.max(0, pathItems.length - previewItems.length);
      const sourceKinds = [
        repo.manualRecognitions?.length ? "manual" : "",
        repo.sessionCount > 0 ? "claude-daemon" : ""
      ].filter(Boolean);
      const snapshot = snapshotsByRoot.get(repo.root) ?? emptyRepoSnapshot(repo.root);
      const row = {
        ...repo,
        repoId: displayRepoRoot(repo.root),
        sourceKinds,
        snapshot,
        snapshotStatus: snapshot.status,
        snapshotId: snapshot.snapshotId,
        snapshotText: repoSnapshotText(snapshot),
        displayRoot: displayRepoRoot(repo.root),
        remoteText: remoteText(repo.remotes),
        recognitionText: repoRecognitionText(repo),
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
      return {
        ...row,
        searchText: searchText([
          row.name,
          row.root,
          row.displayRoot,
          row.remoteText,
          row.recognitionText,
          row.snapshotText,
          row.sourceKinds.join(" "),
          row.sessionText,
          row.pathText,
          row.pathPreviewText,
          row.pathDetailText
        ])
      };
    })
    .filter(repo => !query || includesQuery(repo.searchText, query))
    .sort((a, b) => b.sessionCount - a.sessionCount || b.mentionCount - a.mentionCount || a.root.localeCompare(b.root));
}

function latestRepoSnapshotsByRoot(witnesses) {
  const byRoot = new Map();
  for (const request of projectRepoSnapshotRequests(witnesses)) {
    const current = byRoot.get(request.root);
    if (!current || String(request.requestedAt || "") >= String(current.requestedAt || "")) {
      byRoot.set(request.root, repoSnapshotReadShape(request));
    }
  }
  return byRoot;
}

function repoSnapshotReadShape(request) {
  return {
    status: request.status,
    requestId: request.requestId,
    repoId: request.repoId,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    snapshotId: request.snapshotId || "",
    repoName: request.repoName || request.name || request.repoId,
    remote: displayRemoteUrl(request.remote || ""),
    fileCount: Number.isFinite(Number(request.fileCount)) ? Number(request.fileCount) : 0,
    error: request.error,
    errorText: request.error ? `Error: ${request.error}` : "",
    statusText: repoSnapshotText(request)
  };
}

function emptyRepoSnapshot(root = "") {
  return {
    status: "not_requested",
    requestId: null,
    repoId: displayRepoRoot(root),
    requestedAt: null,
    completedAt: null,
    snapshotId: "",
    repoName: displayRepoRoot(root),
    remote: "",
    fileCount: 0,
    error: null,
    errorText: "",
    statusText: "Snapshot not prepared"
  };
}

function repoSnapshotText(snapshot) {
  if (!snapshot || snapshot.status === "not_requested") return "Snapshot not prepared";
  if (snapshot.status === "pending") return "Snapshot pending";
  if (snapshot.status === "failed") return "Snapshot failed";
  if (snapshot.status === "completed") return `Snapshot ready · ${countText(snapshot.fileCount, "file")}`;
  return "Snapshot not prepared";
}

function repoRecognitionText(repo) {
  const parts = [];
  const manual = Array.isArray(repo.manualRecognitions) ? repo.manualRecognitions : [];
  if (manual.length) {
    const actors = [...new Set(manual.map(row => row.requestedBy).filter(Boolean))];
    parts.push(`Recognized manually${actors.length ? ` by ${actors.join(", ")}` : ""}`);
  }
  if (repo.sessionCount > 0) parts.push(`Noticed by Claude daemon in ${countText(repo.sessionCount, "session")}`);
  return parts.join(" · ");
}

function remoteText(remotes) {
  const rows = Array.isArray(remotes) ? remotes : [];
  if (!rows.length) return "";
  return rows.map(remote => `${remote.name}: ${displayRemoteUrl(remote.url)}`).join(" | ");
}

function countText(count, singular) {
  const number = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${number} ${singular}${number === 1 ? "" : "s"}`;
}

function normalizeFilter(value) {
  const filter = String(value || "").trim().toLowerCase();
  return filter === "desire" || filter === "indexed" ? filter : "";
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function includesQuery(value, query) {
  if (!query) return true;
  return String(value || "").toLowerCase().includes(query);
}

function displayRepoRoot(root) {
  const text = String(root || "");
  if (!text) return "";
  for (const marker of ["/repos/ai/repos/", "/repos/"]) {
    const index = text.indexOf(marker);
    if (index >= 0) return text.slice(index + marker.length);
  }
  const parts = text.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return text;
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join("/");
}

function displayRemoteUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/") || text.startsWith("file://") || /^~[/$]/.test(text)) return "local";
  return text
    .replace(/\/home\/[^/]+\/projects\/swell\/repos\/ai\/repos\//g, "")
    .replace(/\/home\/[^/]+\//g, "~/");
}

function normalizeRepoRecord(body) {
  const root = String(body?.root || "").trim();
  const name = String(body?.name || root.split(/[\\/]/).filter(Boolean).at(-1) || root).trim();
  const remotes = Array.isArray(body?.remotes)
    ? body.remotes.map(remote => ({
      name: String(remote?.name || "").trim(),
      url: String(remote?.url || "").trim()
    })).filter(remote => remote.name && remote.url)
    : [];
  return { root, name, remotes };
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

function enrichSessionDisplay(session) {
  const row = {
    ...session,
    previewBrief: compactText(session.preview, 220),
    repoChipText: repoChipText(session.repoIndex?.repos),
    repoStatusText: session.repoIndex?.statusText || "Repos not indexed",
    transcriptStatusText: session.transcriptPreview?.statusText || "Text not loaded",
    aiStatusText: session.aiSummary?.statusText || "Summary not run"
  };
  return {
    ...row,
    searchText: searchText([
      row.title,
      row.preview,
      row.previewBrief,
      row.project,
      row.origin,
      row.repoChipText,
      row.repoIndex?.summary,
      row.repoIndex?.detailText,
      row.transcriptPreview?.text,
      row.aiSummary?.text,
      row.aiSummary?.bulletText
    ])
  };
}

function searchText(values) {
  return values
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function transcriptPreviewReadShape(request) {
  return {
    status: request.status,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    text: String(request.text || ""),
    error: request.error,
    errorText: request.error ? `Error: ${request.error}` : "",
    actionText: request.status === "completed" ? "Refresh text" : request.status === "failed" ? "Retry text" : "Preview text",
    statusText: transcriptPreviewStatusText(request),
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
    actionText: request.status === "completed" ? "Refresh summary" : request.status === "failed" ? "Retry summary" : "Summarize",
    statusText: aiSummaryStatusText(request),
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
    actionText: "Summarize",
    statusText: "Summary not run",
    summary: "AI summary not run"
  };
}

function aiSummarySummary(request) {
  if (request.status === "waiting_for_transcript") return "Needs transcript preview";
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
    errorText: "",
    actionText: "Preview text",
    statusText: "Text not loaded",
    summary: "Transcript preview not loaded"
  };
}

function transcriptPreviewSummary(request) {
  if (request.status === "pending") return "Transcript preview pending";
  if (request.status === "failed") return "Transcript preview failed";
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
    errorText: request.error ? `Error: ${request.error}` : "",
    actionText: request.status === "completed" ? "Refresh repo index" : request.status === "failed" ? "Retry repo index" : "Index repos",
    statusText: repoIndexStatusText({ ...request, repos }),
    chipText: repoChipText(repos),
    detailText: repoIndexSummary({ ...request, repos }),
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
    errorText: "",
    actionText: "Index repos",
    statusText: "Repos not indexed",
    chipText: "",
    detailText: "",
    summary: "Repo index not run"
  };
}

function repoIndexStatusText(request) {
  if (request.status === "pending") return "Repos pending";
  if (request.status === "failed") return "Repos failed";
  if (request.status !== "completed") return "Repos not indexed";
  if (!request.repos.length) return "No repos found";
  const mentionCount = request.repos.reduce((sum, repo) => sum + repo.mentions.length, 0);
  return `${request.repos.length} ${request.repos.length === 1 ? "repo" : "repos"} · ${mentionCount} ${mentionCount === 1 ? "mention" : "mentions"}`;
}

function repoIndexSummary(request) {
  if (request.status === "pending") return "Repo index pending";
  if (request.status === "failed") return "Repo index failed";
  if (request.status !== "completed") return "Repo index not run";
  if (!request.repos.length) return "No mentioned git repos found";
  return request.repos
    .map(repo => `${repo.name || displayRepoRoot(repo.root)}: ${repo.mentions.length} mentions`)
    .join(" | ");
}

function transcriptPreviewStatusText(request) {
  if (request.status === "pending") return "Text pending";
  if (request.status === "failed") return "Text failed";
  if (request.status !== "completed") return "Text not loaded";
  return request.text ? "Text loaded" : "Text empty";
}

function aiSummaryStatusText(request) {
  if (request.status === "waiting_for_transcript") return "Summary needs text";
  if (request.status === "pending") return "Summary pending";
  if (request.status === "failed") return "Summary failed";
  if (request.status !== "completed") return "Summary not run";
  return request.text || request.bullets.length ? "Summary loaded" : "Summary empty";
}

function repoChipText(repos) {
  const rows = normalizeRepos(repos);
  if (!rows.length) return "";
  return rows
    .map(repo => `${repo.name || displayRepoRoot(repo.root)} · ${repo.mentions.length}`)
    .join("   ");
}

function compactText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
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

export function requestRepoRecognition(world, { actor, backendHost, body }) {
  const path = stringOrNull(body?.path);
  if (!path) return { ok: false, status: 400, error: "path is required" };

  const requestId = `repoRecognition.${path.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)}.${world.allWitnesses().length + 1}`;
  const witness = world.emit({
    process: "repo.recognition.requested",
    actor: actor || backendHost,
    claims: [
      thing(requestId),
      relation(requestId, "repoRecognitionStatus", "pending")
    ],
    body: { requestId, path }
  });
  return { ok: true, status: 202, requestId, path, witness };
}

export function requestRepoSnapshot(world, { actor, backendHost, repoId }) {
  const rid = stringOrNull(repoId);
  if (!rid) return { ok: false, status: 400, error: "repoId is required" };

  const repo = projectRepoIndexRepos(world.allWitnesses()).find(row => row.repoId === rid || row.displayRoot === rid || row.root === rid);
  if (!repo) return { ok: false, status: 404, error: "unknown repo" };

  const requestId = `repoSnapshot.${rid.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)}.${world.allWitnesses().length + 1}`;
  const witness = world.emit({
    process: "repo.snapshot.requested",
    actor: actor || backendHost,
    claims: [
      thing(requestId),
      relation(requestId, "repoSnapshotStatus", "pending"),
      relation(requestId, "targetsRepo", rid)
    ],
    body: {
      requestId,
      repoId: rid,
      root: repo.root,
      name: repo.name || rid
    }
  });
  return { ok: true, status: 202, requestId, repoId: rid, witness };
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

export function completeRepoRecognition(world, { actor, backendHost, body }) {
  const requestId = stringOrNull(body?.requestId);
  if (!requestId) return { ok: false, status: 400, error: "requestId is required" };

  const request = projectRepoRecognitionRequests(world.allWitnesses()).find(row => row.requestId === requestId);
  if (!request) return { ok: false, status: 404, error: "unknown repo recognition request" };
  if (request.status !== "pending") return { ok: true, status: 200, skipped: true, requestId };

  const status = String(body?.status || "").toLowerCase();
  if (status === "failed") {
    const witness = world.emit({
      process: "repo.recognition.failed",
      actor: actor || backendHost,
      claims: [relation(requestId, "repoRecognitionStatus", "failed")],
      body: {
        requestId,
        path: request.path,
        error: String(body?.error || "repo recognition failed")
      }
    });
    return { ok: true, status: 200, requestId, witness };
  }

  const repo = normalizeRepoRecord(body);
  if (!repo.root) return { ok: false, status: 400, error: "root is required" };

  const witness = world.emit({
    process: "repo.recognition.completed",
    actor: actor || backendHost,
    claims: [
      thing(repo.root),
      relation(requestId, "repoRecognitionStatus", "completed"),
      relation(repo.root, "recognizedAs", "gitRepo"),
      relation(requestId, "recognizedRepo", repo.root)
    ],
    body: {
      requestId,
      path: request.path,
      root: repo.root,
      name: repo.name,
      remotes: repo.remotes
    }
  });
  return { ok: true, status: 200, requestId, repo, witness };
}

export function completeRepoSnapshot(world, { actor, backendHost, body }) {
  const requestId = stringOrNull(body?.requestId);
  if (!requestId) return { ok: false, status: 400, error: "requestId is required" };

  const request = projectRepoSnapshotRequests(world.allWitnesses()).find(row => row.requestId === requestId);
  if (!request) return { ok: false, status: 404, error: "unknown repo snapshot request" };
  if (request.status !== "pending") return { ok: true, status: 200, skipped: true, requestId, repoId: request.repoId };

  const status = String(body?.status || "").toLowerCase();
  if (status === "failed") {
    const witness = world.emit({
      process: "repo.snapshot.failed",
      actor: actor || backendHost,
      claims: [relation(requestId, "repoSnapshotStatus", "failed")],
      body: {
        requestId,
        repoId: request.repoId,
        root: request.root,
        error: String(body?.error || "repo snapshot failed")
      }
    });
    return { ok: true, status: 200, requestId, repoId: request.repoId, witness };
  }

  const snapshotId = stringOrNull(body?.snapshotId);
  if (!snapshotId) return { ok: false, status: 400, error: "snapshotId is required" };

  const fileCount = Number.isFinite(Number(body?.fileCount)) ? Number(body.fileCount) : 0;
  const witness = world.emit({
    process: "repo.snapshot.completed",
    actor: actor || backendHost,
    claims: [
      relation(requestId, "repoSnapshotStatus", "completed"),
      relation(request.repoId, "hasRepoSnapshot", snapshotId)
    ],
    body: {
      requestId,
      repoId: request.repoId,
      root: request.root,
      snapshotId,
      repoName: String(body?.repoName || request.name || request.repoId),
      remote: String(body?.remote || ""),
      fileCount
    }
  });
  return { ok: true, status: 200, requestId, repoId: request.repoId, snapshotId, fileCount, witness };
}

// --- handler registration (eden dispatch-handler pattern) -----------------
export function createTilthHandlers({ world, backendHost, sendJson, readJson }) {
  return {
    "sessions.read": async ({ req, res }) => {
      sendJson(res, 200, { sessions: projectFilteredSessions(world.allWitnesses(), requestFilter(req), requestQuery(req)) });
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

    "repo.recognition.request": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const result = requestRepoRecognition(world, { actor: requestActor, backendHost, body });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, requestId: result.requestId, path: result.path, witness: result.witness });
    },

    "repo.snapshot.request": async ({ req, res, requestActor, params }) => {
      const body = params?.repoId ? {} : await readJson(req);
      const result = requestRepoSnapshot(world, {
        actor: requestActor,
        backendHost,
        repoId: params?.repoId || body?.repoId || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, requestId: result.requestId, repoId: result.repoId, witness: result.witness });
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

    "repoRecognition.requests.read": async ({ res }) => {
      const requests = projectRepoRecognitionRequests(world.allWitnesses()).filter(request => request.status === "pending");
      sendJson(res, 200, { requests });
    },

    "repoSnapshot.requests.read": async ({ res }) => {
      const requests = projectRepoSnapshotRequests(world.allWitnesses()).filter(request => request.status === "pending");
      sendJson(res, 200, { requests });
    },

    "repoIndex.repos.read": async ({ req, res }) => {
      const repos = projectRepoIndexRepos(world.allWitnesses(), { filter: requestFilter(req), query: requestQuery(req) })
        .map(repoIndexPublicShape);
      sendJson(res, 200, { repos });
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
    },

    "repoRecognition.request.result": async ({ req, res, requestActor, params }) => {
      const body = await readJson(req);
      const result = completeRepoRecognition(world, {
        actor: requestActor,
        backendHost,
        body: { ...body, requestId: params?.requestId || body?.requestId }
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    },

    "repoSnapshot.request.result": async ({ req, res, requestActor, params }) => {
      const body = await readJson(req);
      const result = completeRepoSnapshot(world, {
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

function requestQuery(req) {
  try {
    const url = new URL(req?.url || "", "http://tilth.local");
    return url.searchParams.get("q") || "";
  } catch {
    return "";
  }
}

function repoIndexPublicShape(repo) {
  const displayRoot = repo.displayRoot || displayRepoRoot(repo.root);
  const {
    root: _root,
    pathText: _pathText,
    searchText: _searchText,
    manualRecognitions: _manualRecognitions,
    remotes: _remotes,
    sessions: rawSessions,
    ...rest
  } = repo;
  return {
    ...rest,
    root: displayRoot,
    displayRoot,
    remotes: Array.isArray(repo.remotes)
      ? repo.remotes.map(remote => ({ name: remote.name, url: displayRemoteUrl(remote.url) }))
      : [],
    manualRecognitions: Array.isArray(repo.manualRecognitions)
      ? repo.manualRecognitions.map(row => ({
        requestId: row.requestId,
        requestedBy: row.requestedBy,
        requestedAt: row.requestedAt,
        completedBy: row.completedBy,
        completedAt: row.completedAt
      }))
      : [],
    sessions: Array.isArray(rawSessions)
      ? rawSessions.map(session => {
        const { paths: _paths, pathText: _sessionPathText, ...sessionRest } = session;
        return sessionRest;
      })
      : []
  };
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
