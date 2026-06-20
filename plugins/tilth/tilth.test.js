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
  projectAiSummaryRequests,
  projectFilteredSessions,
  projectRepoIndexRequests,
  projectRepoIndexRepos,
  projectRepoRecognitionRequests,
  projectRepoSnapshotRequests,
  projectSessions,
  projectTranscriptPreviewRequests,
  requestRepoRecognition,
  requestRepoSnapshot,
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
      msgCount: overrides.msgCount ?? 2
    }
  });
}

test("tilth session template stays flat to avoid duplicated controls", () => {
  const source = readFileSync(new URL("../../examples/tilth/frontend.wtoml", import.meta.url), "utf8");
  const templateMatch = source.match(/id = "session_card_v3_template"[\s\S]*?children = \[([^\]]+)\]/);
  assert.ok(templateMatch);
  assert.doesNotMatch(templateMatch[1], /session_card_v2_actions/);
  assert.doesNotMatch(templateMatch[1], /session_item_actions_repo_clean/);
  assert.doesNotMatch(templateMatch[1], /session_item_statuses_repo_clean/);
  assert.doesNotMatch(source, /id = "session_card_v2_actions"/);
  assert.doesNotMatch(source, /id = "session_item_actions_repo_clean"/);
  assert.doesNotMatch(source, /id = "session_item_statuses_repo_clean"/);
  assert.doesNotMatch(source, /session_item_template_repo_clean/);
  assert.match(source, /template = "session_card_v3_template"/);
  assert.match(templateMatch[1], /session_card_v2_repo_chips/);
  assert.doesNotMatch(source, /'Repos: ' \+ item\.repoIndex\.summary/);
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
  assert.equal(session.aiStatusText, "Summary loaded");
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
  assert.equal(session.transcriptStatusText, "Text loaded");
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
  assert.equal(session.repoIndex.actionText, "Refresh repo index");
  assert.equal(session.repoStatusText, "1 repo · 1 mention");
  assert.equal(session.repoChipText, "meta · 1");
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
