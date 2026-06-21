import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorld } from "../../src/kernel.js";
import {
  completeSessionAiSummary,
  completeSessionRepoIndex,
  completeSessionTranscriptPreview,
  completeRepoRecognition,
  completeRepoSnapshot,
  projectDaemonHeartbeats,
  projectAiSummaryRequests,
  projectFilteredSessions,
  projectJobs,
  projectOpsSummary,
  projectRepoIndexRequests,
  projectRepoIndexRepos,
  projectRepoRecognitionRequests,
  projectRepoSnapshotRequests,
  projectRepoDetail,
  projectSessionDetail,
  projectSessions,
  projectTranscriptPreviewRequests,
  requestRepoRecognition,
  requestRepoSnapshot,
  recordDaemonHeartbeat,
  requestSessionImport,
  requestSessionAiSummary,
  requestSessionMarkDesire,
  requestSessionRepoIndex,
  requestSessionTranscriptPreview
} from "./tilth-sessions.js";

function importSession(world, id = "session-1", overrides = {}) {
  return requestSessionImport(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      id,
      title: overrides.title || "Work on repo",
      preview: overrides.preview || "Mentioned ./src/index.js",
      origin: overrides.origin || "callan",
      project: overrides.project || "meta",
      started: "2026-06-20T00:00:00.000Z",
      msgCount: overrides.msgCount ?? 2,
      lastMessageAt: overrides.lastMessageAt || "2026-06-20T00:00:00.000Z",
      lastMessageRole: Object.hasOwn(overrides, "lastMessageRole") ? overrides.lastMessageRole : "assistant",
      lastMessageText: Object.hasOwn(overrides, "lastMessageText") ? overrides.lastMessageText : "Initial answer"
    }
  });
}

test("tilth session list card stays scannable and leaves evidence to detail pages", () => {
  const source = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const templateMatch = source.match(/id = "session_scan_card_template_v1"[\s\S]*?children = \[([^\]]+)\]/);
  assert.ok(templateMatch);
  assert.doesNotMatch(templateMatch[1], /session_card_v2_actions/);
  assert.doesNotMatch(templateMatch[1], /session_item_actions_repo_clean/);
  assert.doesNotMatch(templateMatch[1], /session_item_statuses_repo_clean/);
  assert.doesNotMatch(templateMatch[1], /session_card_v2_ai_summary_details/);
  assert.doesNotMatch(templateMatch[1], /session_card_v2_repo_details/);
  assert.doesNotMatch(templateMatch[1], /session_card_v2_transcript_details/);
  assert.doesNotMatch(source, /id = "session_card_v2_actions"/);
  assert.doesNotMatch(source, /id = "session_item_actions_repo_clean"/);
  assert.doesNotMatch(source, /id = "session_item_statuses_repo_clean"/);
  assert.doesNotMatch(source, /session_item_template_repo_clean/);
  assert.doesNotMatch(source, /id = "session_card_v2_ai_summary_details"/);
  assert.doesNotMatch(source, /id = "session_card_v2_repo_details"/);
  assert.doesNotMatch(source, /id = "session_card_v2_transcript_details"/);
  assert.doesNotMatch(source, /template = "session_card_v4_template"/);
  assert.match(source, /template = "session_scan_card_template_v1"/);
  assert.match(templateMatch[1], /session_scan_repo_chips_v1/);
  assert.match(templateMatch[1], /session_scan_latest_v1/);
  assert.match(templateMatch[1], /session_scan_transcript_button_v1/);
  assert.match(templateMatch[1], /session_scan_ai_summary_button_v1/);
  assert.match(templateMatch[1], /session_scan_repo_button_v1/);
  assert.match(source, /id = "session_detail_summary_details"/);
  assert.match(source, /id = "session_detail_repo_details"/);
  assert.match(source, /id = "session_detail_transcript_details"/);
  assert.doesNotMatch(source, /'Repos: ' \+ item\.repoIndex\.summary/);
});

test("tilth repo list card stays compact and leaves full paths to detail pages", () => {
  const source = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const templateMatch = source.match(/id = "repo_scan_card_template_v1"[\s\S]*?children = \[([^\]]+)\]/);
  assert.ok(templateMatch);
  assert.match(templateMatch[1], /repo_scan_open_link_v1/);
  assert.match(templateMatch[1], /repo_scan_paths_preview_v1/);
  assert.doesNotMatch(templateMatch[1], /repo_item_sessions_clean/);
  assert.doesNotMatch(templateMatch[1], /repo_item_paths_details_clean/);
  assert.doesNotMatch(source, /template = "repo_item_template_clean"/);
  assert.match(source, /template = "repo_scan_card_template_v1"/);
  assert.doesNotMatch(source, /id = "repo_item_sessions_clean"/);
  assert.doesNotMatch(source, /id = "repo_item_paths_details_clean"/);
  assert.match(source, /id = "repo_detail_paths_details"/);
});

test("tilth jobs view keeps ops controls flat and raw detail collapsed", () => {
  const source = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const sectionMatch = source.match(/id = "tilth_jobs_page_v1"[\s\S]*?children = \[([^\]]+)\]/);
  assert.ok(sectionMatch);
  assert.match(sectionMatch[1], /tilth_jobs_summary_bar_v1/);
  assert.match(sectionMatch[1], /tilth_jobs_filter_bar_v1/);
  assert.equal((sectionMatch[1].match(/tilth_jobs_daemons_list_v1/g) || []).length, 1);
  assert.equal((sectionMatch[1].match(/tilth_jobs_list_v1/g) || []).length, 1);
  assert.match(source, /\[\[details\]\]\nid = "job_item_raw_details_workbench"/);
  assert.doesNotMatch(source, /id = "job_item_error_workbench"/);
  assert.match(source, /url = "\/api\/jobs\?status=failed"/);
  assert.match(source, /url = "\/api\/jobs\?status=pending"/);
  assert.match(source, /url = "\/api\/jobs\?status=completed"/);
});

test("tilth top-level views are routed as pages with page-specific controls", () => {
  const frontend = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../../examples/tilth/backend.wtoml", import.meta.url), "utf8");
  for (const path of ["/", "/repos", "/sessions", "/jobs"]) {
    assert.match(backend, new RegExp(`path = "${path.replace("/", "\\/")}"`));
  }
  assert.match(backend, /rootWidget = "tilth_home_page_v1"/);
  assert.match(backend, /rootWidget = "tilth_repos_page_v1"/);
  assert.match(backend, /rootWidget = "tilth_sessions_page_v1"/);
  assert.match(backend, /rootWidget = "tilth_jobs_page_v1"/);
  assert.match(frontend, /id = "tilth_home_page_v1"/);
  assert.match(frontend, /id = "tilth_repos_page_v1"/);
  assert.match(frontend, /id = "tilth_sessions_page_v1"/);
  assert.match(frontend, /id = "tilth_jobs_page_v1"/);
  assert.match(frontend, /href = "\/repos"/);
  assert.match(frontend, /href = "\/sessions"/);
  assert.match(frontend, /href = "\/jobs"/);
  const jobsPage = frontend.match(/id = "tilth_jobs_page_v1"[\s\S]*?children = \[([^\]]+)\]/);
  assert.ok(jobsPage);
  assert.doesNotMatch(jobsPage[1], /tilth_repos_filter_bar_v1/);
  assert.doesNotMatch(jobsPage[1], /tilth_sessions_filter_bar_v1/);
  assert.match(jobsPage[1], /tilth_jobs_filter_bar_v1/);
});

test("tilth frontend exposes session and repo detail pages", () => {
  const frontend = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../../examples/tilth/backend.wtoml", import.meta.url), "utf8");
  assert.match(backend, /path = "\/session"/);
  assert.match(backend, /handler = "session\.detail\.read"/);
  assert.match(backend, /path = "\/repo"/);
  assert.match(backend, /handler = "repoIndex\.repo\.read"/);
  assert.match(frontend, /href = "\$\{'\/session\?id=' \+ encodeURIComponent\(item\.id \|\| ''\)\}"/);
  assert.match(frontend, /href = "\$\{'\/repo\?id=' \+ encodeURIComponent\(item\.repoId \|\| item\.displayRoot \|\| item\.root \|\| ''\)\}"/);
  assert.match(frontend, /program = "tilth_program_session_detail"[\s\S]*?allowFailure = true/);
  assert.match(frontend, /program = "tilth_program_repo_detail"[\s\S]*?allowFailure = true/);
  assert.match(frontend, /program = "tilth_program_session_detail"[\s\S]*?on = "click:indexRepos"/);
  assert.match(frontend, /program = "tilth_program_session_detail"[\s\S]*?on = "click:previewTranscript"/);
  assert.match(frontend, /program = "tilth_program_session_detail"[\s\S]*?on = "click:summarizeSession"/);
});

test("tilth repo-index requests require a known session", () => {
  const world = createWorld();

  assert.equal(requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "missing" }).status, 404);

  importSession(world);
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  assert.equal(requested.ok, true);
  assert.equal(requested.status, 202);
  assert.equal(projectRepoIndexRequests(world.allWitnesses()).at(-1).status, "pending");
});

test("tilth sessions sort by latest message time", () => {
  const world = createWorld();
  importSession(world, "old", { title: "Old chat", lastMessageAt: "2026-06-20T00:00:00.000Z" });
  importSession(world, "new", { title: "New chat", lastMessageAt: "2026-06-20T00:10:00.000Z" });

  assert.deepEqual(projectSessions(world.allWitnesses()).map(row => row.id), ["new", "old"]);
});

test("tilth session re-import updates latest message and preserves DESIRE", () => {
  const world = createWorld();
  importSession(world, "session-1", {
    msgCount: 1,
    lastMessageAt: "2026-06-20T00:00:00.000Z",
    lastMessageText: "Initial answer"
  });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  importSession(world, "session-1", {
    msgCount: 2,
    lastMessageAt: "2026-06-20T00:05:00.000Z",
    lastMessageRole: "user",
    lastMessageText: "Follow-up question"
  });

  const session = projectSessions(world.allWitnesses(), { now: "2026-06-20T00:10:00.000Z" })[0];
  assert.equal(session.desire, true);
  assert.equal(session.msgCount, 2);
  assert.equal(session.lastMessageAt, "2026-06-20T00:05:00.000Z");
  assert.equal(session.lastMessageLine, "You: Follow-up question");
  assert.equal(session.lastMessageRelativeText, "5 min ago");
  assert.match(session.lastMessageExactText, /2026/);
});

test("tilth session import does not downgrade latest message metadata", () => {
  const world = createWorld();
  importSession(world, "session-1", {
    msgCount: 2,
    lastMessageAt: "2026-06-20T00:10:00.000Z",
    lastMessageRole: "assistant",
    lastMessageText: "Newest answer"
  });
  importSession(world, "session-1", {
    msgCount: 2,
    lastMessageAt: "2026-06-20T00:00:00.000Z",
    lastMessageRole: "",
    lastMessageText: ""
  });

  const session = projectSessions(world.allWitnesses())[0];
  assert.equal(session.lastMessageAt, "2026-06-20T00:10:00.000Z");
  assert.equal(session.lastMessageRole, "assistant");
  assert.equal(session.lastMessageText, "Newest answer");
});

test("tilth manual repo recognition requests require a path", () => {
  const world = createWorld();

  assert.equal(requestRepoRecognition(world, { actor: "callan", backendHost: "backendHost", body: {} }).status, 400);

  const requested = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });
  assert.equal(requested.ok, true);
  assert.equal(requested.status, 202);
  const request = projectRepoRecognitionRequests(world.allWitnesses()).at(-1);
  assert.equal(request.status, "pending");
  assert.equal(request.path, "~/projects/swell/repos/ai/repos/meta/tilth-net");
});

test("tilth transcript-preview requests require a known session", () => {
  const world = createWorld();

  assert.equal(requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "missing" }).status, 404);

  importSession(world);
  const requested = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  assert.equal(requested.ok, true);
  assert.equal(requested.status, 202);
  assert.equal(projectTranscriptPreviewRequests(world.allWitnesses()).at(-1).status, "pending");
});

test("tilth AI-summary requests require a known DESIRE session", () => {
  const world = createWorld();

  assert.equal(requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "missing" }).status, 404);

  importSession(world);
  const unmarked = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  assert.equal(unmarked.status, 409);

  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const requested = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  assert.equal(requested.ok, true);
  assert.equal(requested.status, 202);
  assert.equal(projectAiSummaryRequests(world.allWitnesses()).at(-1).status, "waiting_for_transcript");
  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.aiSummary.summary, "Needs transcript preview");
});

test("tilth AI-summary requests become daemon-visible after transcript preview loads", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: preview.requestId,
      status: "completed",
      text: "You:\nPlease summarize this DESIRE session.\n"
    }
  });

  const request = projectAiSummaryRequests(world.allWitnesses()).at(-1);
  assert.equal(request.status, "pending");
  assert.match(request.transcriptText, /Please summarize/);
});

test("tilth AI-summary completion projects onto the session", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nBuild the feature.\n" }
  });
  const requested = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  const completed = completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      text: "The session planned and implemented a Tilth feature.",
      bullets: ["Added request/result plumbing", "Updated the UI"]
    }
  });

  assert.equal(completed.ok, true);
  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.aiSummary.status, "completed");
  assert.equal(session.aiSummary.summary, "AI summary loaded");
  assert.equal(session.aiSummary.sourceLastMessageAt, "2026-06-20T00:00:00.000Z");
  assert.equal(session.aiSummary.sourceMsgCount, 2);
  assert.equal(session.aiSummary.freshness, "fresh");
  assert.equal(session.aiStatusText, "Summary: fresh");
  assert.match(session.aiSummary.versionText, /based on 2 msgs/);
  assert.equal(session.aiSummary.actionText, "Refresh summary");
  assert.equal(session.aiSummary.text, "The session planned and implemented a Tilth feature.");
  assert.deepEqual(session.aiSummary.bullets, ["Added request/result plumbing", "Updated the UI"]);
  assert.equal(session.aiSummary.bulletText, "- Added request/result plumbing\n- Updated the UI");
});

test("tilth transcript-preview completion projects onto the session", () => {
  const world = createWorld();
  importSession(world);
  const requested = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  const completed = completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      text: "You:\nOpen the repo\n\n---\n\nClaude:\nDone\n"
    }
  });

  assert.equal(completed.ok, true);
  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.transcriptPreview.status, "completed");
  assert.match(session.transcriptPreview.text, /Open the repo/);
  assert.equal(session.transcriptPreview.summary, "Transcript preview loaded");
  assert.equal(session.transcriptPreview.sourceLastMessageAt, "2026-06-20T00:00:00.000Z");
  assert.equal(session.transcriptPreview.sourceMsgCount, 2);
  assert.equal(session.transcriptPreview.freshness, "fresh");
  assert.equal(session.transcriptStatusText, "Text: fresh");
  assert.match(session.transcriptPreview.versionText, /based on 2 msgs/);
  assert.equal(session.transcriptPreview.actionText, "Refresh text");
});

test("tilth repo-index completion projects onto the session", () => {
  const world = createWorld();
  importSession(world);
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  const completed = completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/meta",
        name: "meta",
        mentions: [{ path: "/home/callan/projects/swell/repos/ai/repos/meta/witness-world--tilth", raw: "witness-world--tilth", role: "user", timestamp: "now" }]
      }]
    }
  });

  assert.equal(completed.ok, true);
  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.repoIndex.status, "completed");
  assert.equal(session.repoIndex.repoCount, 1);
  assert.equal(session.repoIndex.mentionCount, 1);
  assert.match(session.repoIndex.summary, /meta/);
  assert.equal(session.repoIndex.sourceLastMessageAt, "2026-06-20T00:00:00.000Z");
  assert.equal(session.repoIndex.sourceMsgCount, 2);
  assert.equal(session.repoIndex.freshness, "fresh");
  assert.equal(session.repoIndex.actionText, "Refresh repo index");
  assert.equal(session.repoStatusText, "Repos: fresh");
  assert.equal(session.repoChipText, "meta · 1");
});

test("tilth completed session artifacts become stale when the session has newer text", () => {
  const world = createWorld();
  importSession(world, "session-1", {
    lastMessageAt: "2026-06-20T00:00:00.000Z",
    lastMessageText: "Initial answer"
  });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const repo = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: repo.requestId,
      status: "completed",
      repos: [{ root: "/home/callan/projects/swell/repos/ai/repos/meta", name: "meta", mentions: [] }]
    }
  });
  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nInitial answer\n" }
  });
  const summary = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: summary.requestId, status: "completed", text: "Initial summary.", bullets: [] }
  });

  importSession(world, "session-1", {
    msgCount: 3,
    lastMessageAt: "2026-06-20T00:05:00.000Z",
    lastMessageRole: "user",
    lastMessageText: "Can you revisit this?"
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.repoIndex.freshness, "stale");
  assert.equal(session.transcriptPreview.freshness, "stale");
  assert.equal(session.aiSummary.freshness, "stale");
  assert.equal(session.repoIndex.staleTimeText, "5m");
  assert.equal(session.repoIndex.staleMsgCount, 1);
  assert.equal(session.repoIndex.staleMsgText, "1 msg behind");
  assert.match(session.repoIndex.versionText, /stale by 5m · 1 msg behind/);
  assert.equal(session.repoStatusText, "Repos: stale by 5m");
  assert.equal(session.transcriptStatusText, "Text: stale by 5m");
  assert.equal(session.aiStatusText, "Summary: stale by 5m");
  assert.equal(session.repoIndex.actionText, "Refresh stale repo index");
  assert.equal(session.transcriptPreview.actionText, "Refresh stale text");
  assert.equal(session.aiSummary.actionText, "Refresh stale summary");
});

test("tilth legacy completed session artifacts report unknown freshness", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  world.emit({
    process: "session.repoIndex.requested",
    actor: "old-daemon",
    claims: [],
    body: { requestId: "repo.legacy", sessionId: "session-1", id: "session-1" }
  });
  world.emit({
    process: "session.repoIndex.completed",
    actor: "old-daemon",
    claims: [],
    body: {
      requestId: "repo.legacy",
      sessionId: "session-1",
      repos: [{ root: "/home/callan/projects/swell/repos/ai/repos/meta", name: "meta", mentions: [] }]
    }
  });
  world.emit({
    process: "session.transcriptPreview.requested",
    actor: "old-daemon",
    claims: [],
    body: { requestId: "text.legacy", sessionId: "session-1", id: "session-1" }
  });
  world.emit({
    process: "session.transcriptPreview.completed",
    actor: "old-daemon",
    claims: [],
    body: { requestId: "text.legacy", sessionId: "session-1", text: "You:\nLegacy text\n" }
  });
  world.emit({
    process: "session.aiSummary.requested",
    actor: "old-daemon",
    claims: [],
    body: { requestId: "summary.legacy", sessionId: "session-1", id: "session-1" }
  });
  world.emit({
    process: "session.aiSummary.completed",
    actor: "old-daemon",
    claims: [],
    body: { requestId: "summary.legacy", sessionId: "session-1", text: "Legacy summary.", bullets: [] }
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.repoIndex.freshness, "unknown");
  assert.equal(session.transcriptPreview.freshness, "unknown");
  assert.equal(session.aiSummary.freshness, "unknown");
  assert.equal(session.repoStatusText, "Repos: freshness unknown");
  assert.equal(session.transcriptStatusText, "Text: freshness unknown");
  assert.equal(session.aiStatusText, "Summary: freshness unknown");
  assert.equal(session.repoIndex.unknownFreshness, true);
  assert.equal(session.transcriptPreview.unknownFreshness, true);
  assert.equal(session.aiSummary.unknownFreshness, true);
});

test("tilth timestamp-only artifacts show time staleness without inventing message lag", () => {
  const world = createWorld();
  importSession(world, "session-1", {
    msgCount: 10,
    lastMessageAt: "2026-06-20T00:00:00.000Z"
  });
  world.emit({
    process: "session.transcriptPreview.requested",
    actor: "old-daemon",
    claims: [],
    body: {
      requestId: "text.timestamp-only",
      sessionId: "session-1",
      sourceLastMessageAt: "2026-06-20T00:00:00.000Z"
    }
  });
  world.emit({
    process: "session.transcriptPreview.completed",
    actor: "old-daemon",
    claims: [],
    body: {
      requestId: "text.timestamp-only",
      sessionId: "session-1",
      sourceLastMessageAt: "2026-06-20T00:00:00.000Z",
      sourceMsgCount: null,
      completedAt: "2026-06-20T00:00:10.000Z",
      text: "You:\nOld text\n"
    }
  });
  importSession(world, "session-1", {
    msgCount: 12,
    lastMessageAt: "2026-06-20T00:05:00.000Z"
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.transcriptPreview.freshness, "stale");
  assert.equal(session.transcriptPreview.staleTimeText, "5m");
  assert.equal(session.transcriptPreview.staleMsgCount, 0);
  assert.equal(session.transcriptPreview.staleMsgText, "");
  assert.doesNotMatch(session.transcriptPreview.versionText, /0 msgs|msgs behind/);
  assert.equal(session.transcriptStatusText, "Text: stale by 5m");
});

test("tilth session search matches projected workbench text", () => {
  const world = createWorld();
  importSession(world, "session-alpha", { title: "Fix daemon queue", preview: "Inspect tilth-net-daemon failures" });
  importSession(world, "session-beta", { title: "Design mobile cards", preview: "Polish a separate UI" });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-alpha" });
  const summary = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-alpha" });
  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-alpha" }).requestId, status: "completed", text: "Queue visibility." }
  });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: summary.requestId, status: "completed", text: "Daemon observability and queue failures.", bullets: ["Surface failures"] }
  });

  assert.deepEqual(projectFilteredSessions(world.allWitnesses(), "", "mobile").map(row => row.id), ["session-beta"]);
  assert.deepEqual(projectFilteredSessions(world.allWitnesses(), "", "observability").map(row => row.id), ["session-alpha"]);
  assert.deepEqual(projectFilteredSessions(world.allWitnesses(), "desire", "mobile").map(row => row.id), []);
});

test("tilth repo search matches repo, remote, session, and path text", () => {
  const world = createWorld();
  importSession(world, "session-alpha", { title: "Work on tilth repo" });
  importSession(world, "session-beta", { title: "Work on other repo" });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-alpha" });

  const alpha = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-alpha" });
  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: alpha.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net-daemon",
        name: "tilth-net-daemon",
        remotes: [{ name: "origin", url: "git@example.com:tilth-net-daemon.git" }],
        mentions: [{ path: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net-daemon/load-me.mjs" }]
      }]
    }
  });

  assert.deepEqual(projectRepoIndexRepos(world.allWitnesses(), { query: "load-me" }).map(row => row.name), ["tilth-net-daemon"]);
  assert.deepEqual(projectRepoIndexRepos(world.allWitnesses(), { query: "example.com" }).map(row => row.name), ["tilth-net-daemon"]);
  assert.deepEqual(projectRepoIndexRepos(world.allWitnesses(), { filter: "desire", query: "tilth-net-daemon" }).map(row => row.name), ["tilth-net-daemon"]);
  assert.deepEqual(projectRepoIndexRepos(world.allWitnesses(), { filter: "indexed", query: "missing" }).map(row => row.name), []);
});

test("tilth completed manual repo recognition creates repo row without sessions", () => {
  const world = createWorld();
  const requested = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });

  const completed = completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: [{ name: "origin", url: "git@example.com:tilth-net.git" }]
    }
  });

  assert.equal(completed.ok, true);
  const repos = projectRepoIndexRepos(world.allWitnesses());
  assert.equal(repos.length, 1);
  assert.equal(repos[0].name, "tilth-net");
  assert.equal(repos[0].sessionCount, 0);
  assert.equal(repos[0].mentionCount, 0);
  assert.deepEqual(repos[0].sourceKinds, ["manual"]);
  assert.match(repos[0].recognitionText, /Recognized manually by callan/);
});

test("tilth manual and daemon repo recognition merge by root with provenance", () => {
  const world = createWorld();
  importSession(world);
  const indexed = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionRepoIndex(world, {
    actor: "claude-daemon",
    backendHost: "backendHost",
    body: {
      requestId: indexed.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
        name: "tilth-net",
        remotes: [{ name: "origin", url: "git@example.com:tilth-net.git" }],
        mentions: [{ path: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net/load-me.mjs" }]
      }]
    }
  });
  const manual = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });
  completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: manual.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: [{ name: "origin", url: "git@example.com:tilth-net.git" }]
    }
  });

  const repos = projectRepoIndexRepos(world.allWitnesses());
  assert.equal(repos.length, 1);
  assert.equal(repos[0].sessionCount, 1);
  assert.equal(repos[0].mentionCount, 1);
  assert.deepEqual(repos[0].sourceKinds, ["manual", "claude-daemon"]);
  assert.match(repos[0].recognitionText, /Recognized manually by callan/);
  assert.match(repos[0].recognitionText, /Noticed by Claude daemon in 1 session/);
});

test("tilth failed manual repo recognition does not create repo row", () => {
  const world = createWorld();
  const requested = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/not-a-repo" }
  });
  completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: requested.requestId, status: "failed", error: "not a git repo" }
  });

  assert.equal(projectRepoRecognitionRequests(world.allWitnesses()).at(-1).status, "failed");
  assert.deepEqual(projectRepoIndexRepos(world.allWitnesses()), []);
});

test("tilth repo snapshot requests expose pending raw root only to daemon queue", () => {
  const world = createWorld();
  const manual = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });
  completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: manual.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: [{ name: "origin", url: "https://github.com/callanbright/tilth-net" }]
    }
  });

  const requested = requestRepoSnapshot(world, {
    actor: "callan",
    backendHost: "backendHost",
    repoId: "meta/tilth-net"
  });

  assert.equal(requested.status, 202);
  const queue = projectRepoSnapshotRequests(world.allWitnesses());
  assert.equal(queue.length, 1);
  assert.equal(queue[0].repoId, "meta/tilth-net");
  assert.equal(queue[0].root, "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net");
  const repo = projectRepoIndexRepos(world.allWitnesses())[0];
  assert.equal(repo.snapshot.status, "pending");
  assert.equal(repo.snapshotText, "Snapshot pending");
});

test("tilth completed repo snapshot records manifest metadata", () => {
  const world = createWorld();
  const manual = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });
  completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: manual.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: []
    }
  });
  const requested = requestRepoSnapshot(world, {
    actor: "callan",
    backendHost: "backendHost",
    repoId: "meta/tilth-net"
  });

  completeRepoSnapshot(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      snapshotId: "meta_tilth-net_123",
      repoName: "tilth-net",
      remote: "callanbright/tilth-net",
      fileCount: 7
    }
  });

  const repo = projectRepoIndexRepos(world.allWitnesses())[0];
  assert.equal(repo.snapshot.status, "completed");
  assert.equal(repo.snapshot.snapshotId, "meta_tilth-net_123");
  assert.equal(repo.snapshot.fileCount, 7);
  assert.equal(repo.snapshotText, "Snapshot ready · 7 files");
});

test("tilth jobs projection aggregates visible local work", () => {
  const world = createWorld();
  const manual = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });
  completeRepoRecognition(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: manual.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: []
    }
  });
  requestRepoSnapshot(world, {
    actor: "callan",
    backendHost: "backendHost",
    repoId: "meta/tilth-net"
  });

  const jobs = projectJobs(world.allWitnesses());
  const snapshotJob = jobs.find(job => job.kind === "repo-snapshot");
  assert.equal(snapshotJob.status, "pending");
  assert.equal(snapshotJob.worker, "tilth-daemon");
  assert.equal(snapshotJob.label, "meta/tilth-net");
  assert.equal(jobs.some(job => job.kind === "repo-recognition" && job.status === "completed"), true);
});

test("tilth daemon heartbeats project latest active daemon", () => {
  const world = createWorld();
  recordDaemonHeartbeat(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-daemon",
      label: "tilth-daemon",
      at: "2026-06-20T00:00:00.000Z",
      capabilities: ["repo-recognition", "repo-snapshot", "ai-summary"],
      counters: { repoSnapshots: 2 }
    }
  });

  const daemons = projectDaemonHeartbeats(world.allWitnesses(), { now: "2026-06-20T00:00:30.000Z" });
  const tilthDaemon = daemons.find(daemon => daemon.daemonId === "tilth-daemon");
  const claudeDaemon = daemons.find(daemon => daemon.daemonId === "tilth-claude-code-daemon");
  assert.equal(daemons.length, 2);
  assert.equal(tilthDaemon.status, "active");
  assert.equal(tilthDaemon.capabilitiesText, "repo-recognition, repo-snapshot, ai-summary");
  assert.match(tilthDaemon.countersText, /repoSnapshots: 2/);
  assert.equal(tilthDaemon.counterSummaryText, "repoSnapshots: 2");
  assert.equal(tilthDaemon.ageText, "30s ago");
  assert.equal(tilthDaemon.metaText, "active · seen 30s ago");
  assert.equal(claudeDaemon.status, "never seen");
  assert.equal(claudeDaemon.detailText, "Handles Claude Code session import, repo indexing, and transcript previews");
  assert.equal(claudeDaemon.ageText, "never");
});

test("tilth daemon heartbeats mark expected daemons stale", () => {
  const world = createWorld();
  recordDaemonHeartbeat(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-claude-code-daemon",
      label: "tilth-claude-code-daemon",
      at: "2026-06-20T00:00:00.000Z",
      capabilities: ["session-import", "repo-index", "transcript-preview"]
    }
  });

  const daemons = projectDaemonHeartbeats(world.allWitnesses(), { now: "2026-06-20T00:03:00.000Z" });
  const daemon = daemons.find(row => row.daemonId === "tilth-claude-code-daemon");
  assert.equal(daemon.status, "stale");
});

test("tilth jobs projection includes successful daemon activity", () => {
  const world = createWorld();
  recordDaemonHeartbeat(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-claude-code-daemon",
      label: "tilth-claude-code-daemon",
      at: "2026-06-20T00:00:00.000Z",
      capabilities: ["session-import", "repo-index", "transcript-preview"],
      counters: { imported: 1, repoIndexed: 1, transcriptPreviewed: 1 }
    }
  });

  const jobs = projectJobs(world.allWitnesses(), { now: "2026-06-20T00:00:30.000Z" });
  const tick = jobs.find(job => job.source === "heartbeat" && job.worker === "tilth-claude-code-daemon");
  assert.equal(tick.status, "completed");
  assert.match(tick.detailText, /imported: 1/);
});

test("tilth jobs projection treats blank limit as default history limit", () => {
  const world = createWorld();
  recordDaemonHeartbeat(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-daemon",
      label: "tilth-daemon",
      at: "2026-06-20T00:00:00.000Z",
      capabilities: ["repo-recognition", "repo-snapshot", "ai-summary"]
    }
  });
  recordDaemonHeartbeat(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-claude-code-daemon",
      label: "tilth-claude-code-daemon",
      at: "2026-06-20T00:00:01.000Z",
      capabilities: ["session-import", "repo-index", "transcript-preview"]
    }
  });

  assert.equal(projectJobs(world.allWitnesses(), { limit: "" }).length, 2);
});

test("tilth jobs projection keeps raw error detail out of collapsed text", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nSummarize this." }
  });
  const request = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: request.requestId,
      status: "failed",
      error: 'model request failed: HTTP 429 { "error": { "message": "Rate limit reached for gpt-4.1-mini on tokens per min. Please try again later." } }'
    }
  });

  const job = projectJobs(world.allWitnesses()).find(row => row.kind === "ai-summary");
  assert.equal(job.kindLabel, "AI summary");
  assert.equal(job.statusRank, 0);
  assert.equal(job.shortStatusText, "failed");
  assert.match(job.titleText, /^AI summary · /);
  assert.match(job.detailText, /HTTP 429|Rate limit reached/i);
  assert.ok(job.detailText.length < job.error.length);
  assert.equal(job.errorDetailText, job.error);
  assert.equal(job.rawDetailText, job.error);
});

test("tilth jobs projection sorts by recent activity by default", () => {
  const world = createWorld();
  importSession(world, "old", { title: "Old failed chat" });
  importSession(world, "new", { title: "New completed chat" });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "old" });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "new" });
  const failed = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "old" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      requestId: failed.requestId,
      status: "failed",
      error: "model unavailable",
      completedAt: "2026-06-20T00:00:00.000Z"
    }
  });
  const completed = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "new" });
  completeSessionTranscriptPreview(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: {
      requestId: completed.requestId,
      status: "completed",
      text: "You:\nNew work.",
      completedAt: "2026-06-20T00:10:00.000Z"
    }
  });

  const jobs = projectJobs(world.allWitnesses());
  assert.equal(jobs[0].status, "completed");
  assert.equal(jobs[0].targetId, "new");
  assert.equal(projectJobs(world.allWitnesses(), { status: "failed" })[0].targetId, "old");
});

test("tilth jobs failed filter still isolates failed work", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nSummarize this." }
  });
  const summary = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: summary.requestId, status: "failed", error: "model unavailable" }
  });

  const failedJobs = projectJobs(world.allWitnesses(), { status: "failed" });
  assert.deepEqual(failedJobs.map(job => job.status), ["failed"]);
});

test("tilth ops summary counts jobs daemons and artifact freshness", () => {
  const world = createWorld();
  importSession(world, "session-1", { lastMessageAt: "2026-06-20T00:00:00.000Z" });
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nInitial text." }
  });
  const repo = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionRepoIndex(world, {
    actor: "tilth-claude-code-daemon",
    backendHost: "backendHost",
    body: { requestId: repo.requestId, status: "failed", error: "git unavailable" }
  });
  importSession(world, "session-1", {
    msgCount: 3,
    lastMessageAt: "2026-06-20T00:05:00.000Z",
    lastMessageText: "Newer text"
  });
  recordDaemonHeartbeat(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: {
      daemonId: "tilth-daemon",
      label: "tilth-daemon",
      at: "2026-06-20T00:05:00.000Z",
      capabilities: ["repo-recognition", "repo-snapshot", "ai-summary"]
    }
  });

  const summary = projectOpsSummary(world.allWitnesses(), { now: "2026-06-20T00:05:30.000Z" });
  assert.equal(summary.failed, 1);
  assert.equal(summary.pending, 0);
  assert.equal(summary.completed, 2);
  assert.equal(summary.staleArtifacts, 1);
  assert.equal(summary.activeDaemons, 1);
  assert.equal(summary.missingDaemons, 1);
  assert.match(summary.workText, /1 failed job/);
  assert.match(summary.artifactText, /1 stale artifact/);
  assert.match(summary.daemonText, /1\/2 daemons active/);
});

test("tilth repo-index repos invert completed session results by repository", () => {
  const world = createWorld();
  importSession(world, "session-1");
  importSession(world, "session-2");
  const first = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const second = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-2" });

  for (const request of [first, second]) {
    completeSessionRepoIndex(world, {
      actor: "daemon",
      backendHost: "backendHost",
      body: {
        requestId: request.requestId,
        status: "completed",
        repos: [{
          root: "/repo/meta",
          name: "meta",
          mentions: [{ path: `/repo/meta/${request.sessionId}.js`, raw: "src/file.js", role: "assistant", timestamp: "now" }]
        }]
      }
    });
  }

  const repos = projectRepoIndexRepos(world.allWitnesses());
  assert.equal(repos.length, 1);
  assert.equal(repos[0].root, "/repo/meta");
  assert.equal(repos[0].sessionCount, 2);
  assert.equal(repos[0].mentionCount, 2);
  assert.equal(repos[0].mentionText, "2 mentions");
  assert.match(repos[0].sessionText, /From: Work on repo · 1 mention/);
});

test("tilth session detail projects one session with related repos and jobs", () => {
  const world = createWorld();
  importSession(world, "session-1");
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
        name: "tilth-net",
        remotes: [{ name: "origin", url: "git@example.com:callan/tilth-net.git" }],
        mentions: [{ path: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net/load-me.mjs", raw: "load-me.mjs", role: "assistant", timestamp: "now" }]
      }]
    }
  });

  const detail = projectSessionDetail(world.allWitnesses(), "session-1");
  assert.equal(detail.session.id, "session-1");
  assert.equal(detail.sessions.length, 1);
  assert.equal(detail.repos.length, 1);
  assert.equal(detail.repos[0].displayRoot, "meta/tilth-net");
  assert.equal(detail.repos[0].pathPreviewText, "load-me.mjs");
  assert.equal(detail.repos[0].remoteText, "origin: git@example.com:callan/tilth-net.git");
  assert.equal(detail.jobs.some(job => job.kind === "repo-index" && job.targetId === "session-1"), true);
  assert.equal(projectSessionDetail(world.allWitnesses(), "missing"), null);
});

test("tilth repo detail projects one repo with related sessions and jobs", () => {
  const world = createWorld();
  importSession(world, "session-1");
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
        name: "tilth-net",
        mentions: [{ path: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net/scripts-private/me.sh", raw: "scripts-private/me.sh", role: "assistant", timestamp: "now" }]
      }]
    }
  });
  requestRepoSnapshot(world, { actor: "callan", backendHost: "backendHost", repoId: "meta/tilth-net" });

  const detail = projectRepoDetail(world.allWitnesses(), "meta/tilth-net");
  assert.equal(detail.repo.repoId, "meta/tilth-net");
  assert.equal(detail.repos.length, 1);
  assert.equal(detail.sessions.length, 1);
  assert.equal(detail.sessions[0].id, "session-1");
  assert.equal(detail.sessions[0].pathPreviewText, "scripts-private/me.sh");
  assert.equal(detail.jobs.some(job => job.kind === "repo-snapshot" && job.targetId === "meta/tilth-net"), true);
  assert.equal(projectRepoDetail(world.allWitnesses(), "missing"), null);
});

test("tilth session filters project DESIRE and indexed subsets", () => {
  const world = createWorld();
  importSession(world, "session-1");
  importSession(world, "session-2");
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-2" });
  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      repos: [{ root: "/repo/meta", name: "meta", mentions: [{ path: "/repo/meta/file.js", raw: "file.js", role: "assistant", timestamp: "now" }] }]
    }
  });

  assert.deepEqual(projectFilteredSessions(world.allWitnesses(), "desire").map(row => row.id), ["session-1"]);
  assert.deepEqual(projectFilteredSessions(world.allWitnesses(), "indexed").map(row => row.id), ["session-2"]);
});

test("tilth repo filters only include matching session memberships", () => {
  const world = createWorld();
  importSession(world, "session-1");
  importSession(world, "session-2");
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const first = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const second = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-2" });

  for (const request of [first, second]) {
    completeSessionRepoIndex(world, {
      actor: "daemon",
      backendHost: "backendHost",
      body: {
        requestId: request.requestId,
        status: "completed",
        repos: [{
          root: "/repo/meta",
          name: "meta",
          mentions: [{ path: `/repo/meta/${request.sessionId}.js`, raw: "src/file.js", role: "assistant", timestamp: "now" }]
        }]
      }
    });
  }

  const desireRepos = projectRepoIndexRepos(world.allWitnesses(), { filter: "desire" });
  assert.equal(desireRepos.length, 1);
  assert.equal(desireRepos[0].sessionCount, 1);
  assert.equal(desireRepos[0].mentionText, "1 mention");
  assert.equal(desireRepos[0].sessions[0].id, "session-1");

  const indexedRepos = projectRepoIndexRepos(world.allWitnesses(), { filter: "indexed" });
  assert.equal(indexedRepos[0].sessionCount, 2);
});

test("tilth repo-index repo display fields are compact without losing raw paths", () => {
  const world = createWorld();
  importSession(world);
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      repos: [{
        root: "/home/callan/projects/swell/repos/ai/repos/aa-colab/witness-world",
        name: "witness-world",
        remotes: [{ name: "origin", url: "git@example.com:aa-colab/witness-world.git" }],
        mentions: [
          { path: "/home/callan/projects/swell/repos/ai/repos/aa-colab/witness-world/src/kernel.js", raw: "src/kernel.js", role: "assistant", timestamp: "now" },
          { path: "/home/callan/projects/swell/repos/ai/repos/aa-colab/witness-world/src/kernel.js", raw: "src/kernel.js", role: "assistant", timestamp: "now" },
          { path: "/home/callan/projects/swell/repos/ai/repos/aa-colab/witness-world/node_modules/pkg/index.js", raw: "node_modules/pkg/index.js", role: "assistant", timestamp: "now" },
          { path: "/home/callan/projects/swell/repos/ai/repos/aa-colab/witness-world/docs/SYSTEM.md", raw: "docs/SYSTEM.md", role: "assistant", timestamp: "now" }
        ]
      }]
    }
  });

  const repo = projectRepoIndexRepos(world.allWitnesses())[0];
  assert.equal(repo.displayRoot, "aa-colab/witness-world");
  assert.deepEqual(repo.remotes, [{ name: "origin", url: "git@example.com:aa-colab/witness-world.git" }]);
  assert.equal(repo.remoteText, "origin: git@example.com:aa-colab/witness-world.git");
  assert.deepEqual(repo.pathItems, ["src/kernel.js", "docs/SYSTEM.md"]);
  assert.equal(repo.pathDetailText, "src/kernel.js\ndocs/SYSTEM.md");
  assert.match(repo.pathText, /node_modules\/pkg\/index\.js/);
  assert.match(repo.sessions[0].pathText, /node_modules\/pkg\/index\.js/);
});

test("tilth repo display does not expose local workspace layout", () => {
  const world = createWorld();
  const requested = requestRepoRecognition(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { path: "~/projects/swell/repos/ai/repos/meta/tilth-net" }
  });

  completeRepoRecognition(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      requestId: requested.requestId,
      status: "completed",
      root: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net",
      name: "tilth-net",
      remotes: [{ name: "origin", url: "/home/callan/projects/swell/repos/ai/repos/meta/tilth-net.git" }]
    }
  });

  const repo = projectRepoIndexRepos(world.allWitnesses())[0];
  assert.equal(repo.displayRoot, "meta/tilth-net");
  assert.equal(repo.remoteText, "origin: local");
  assert.doesNotMatch(repo.displayRoot, /projects\/swell\/repos\/ai/);
  assert.doesNotMatch(repo.remoteText, /projects\/swell\/repos\/ai/);
});

test("tilth repo-index failures project onto the session", () => {
  const world = createWorld();
  importSession(world);
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionRepoIndex(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: requested.requestId, status: "failed", error: "session log not found" }
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.repoIndex.status, "failed");
  assert.equal(session.repoIndex.error, "session log not found");
  assert.equal(session.repoIndex.errorText, "Error: session log not found");
  assert.equal(session.repoIndex.actionText, "Retry repo index");
  assert.equal(session.repoIndex.summary, "Repo index failed");
  assert.equal(session.repoStatusText, "Repos failed");
});

test("tilth transcript-preview failures project onto the session", () => {
  const world = createWorld();
  importSession(world);
  const requested = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: requested.requestId, status: "failed", error: "session log not found" }
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.transcriptPreview.status, "failed");
  assert.equal(session.transcriptPreview.error, "session log not found");
  assert.equal(session.transcriptPreview.errorText, "Error: session log not found");
  assert.equal(session.transcriptPreview.actionText, "Retry text");
  assert.equal(session.transcriptPreview.summary, "Transcript preview failed");
  assert.equal(session.transcriptStatusText, "Text failed");
});

test("tilth AI-summary failures project onto the session", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const requested = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });

  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: requested.requestId, status: "failed", error: "model unavailable" }
  });

  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.aiSummary.status, "failed");
  assert.equal(session.aiSummary.error, "model unavailable");
  assert.equal(session.aiSummary.errorText, "Error: model unavailable");
  assert.equal(session.aiSummary.summary, "AI summary failed");
  assert.equal(session.aiSummary.actionText, "Retry summary");
  assert.equal(session.aiStatusText, "Summary failed");
});

test("tilth AI-summary retry creates a newer visible result while preserving failed history", () => {
  const world = createWorld();
  importSession(world);
  requestSessionMarkDesire(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  const preview = requestSessionTranscriptPreview(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionTranscriptPreview(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: { requestId: preview.requestId, status: "completed", text: "You:\nBuild the feature.\n" }
  });

  const failed = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: failed.requestId, status: "failed", error: "rate limited" }
  });
  const retry = requestSessionAiSummary(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  completeSessionAiSummary(world, {
    actor: "tilth-daemon",
    backendHost: "backendHost",
    body: { requestId: retry.requestId, status: "completed", text: "Retry succeeded.", bullets: ["Recovered"] }
  });

  const requests = projectAiSummaryRequests(world.allWitnesses());
  assert.equal(requests.some(request => request.status === "failed" && request.error === "rate limited"), true);
  const session = projectSessions(world.allWitnesses()).find(row => row.id === "session-1");
  assert.equal(session.aiSummary.status, "completed");
  assert.equal(session.aiSummary.requestId, retry.requestId);
  assert.equal(session.aiSummary.text, "Retry succeeded.");
});
