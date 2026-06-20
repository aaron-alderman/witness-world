import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/kernel.js";
import {
  completeSessionAiSummary,
  completeSessionRepoIndex,
  completeSessionTranscriptPreview,
  projectAiSummaryRequests,
  projectFilteredSessions,
  projectRepoIndexRequests,
  projectRepoIndexRepos,
  projectSessions,
  projectTranscriptPreviewRequests,
  requestSessionImport,
  requestSessionAiSummary,
  requestSessionMarkDesire,
  requestSessionRepoIndex,
  requestSessionTranscriptPreview
} from "./tilth-sessions.js";

function importSession(world, id = "session-1") {
  return requestSessionImport(world, {
    actor: "daemon",
    backendHost: "backendHost",
    body: {
      id,
      title: "Work on repo",
      preview: "Mentioned ./src/index.js",
      origin: "callan",
      project: "meta",
      started: "2026-06-20T00:00:00.000Z",
      msgCount: 2
    }
  });
}

test("tilth repo-index requests require a known session", () => {
  const world = createWorld();

  assert.equal(requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "missing" }).status, 404);

  importSession(world);
  const requested = requestSessionRepoIndex(world, { actor: "callan", backendHost: "backendHost", id: "session-1" });
  assert.equal(requested.ok, true);
  assert.equal(requested.status, 202);
  assert.equal(projectRepoIndexRequests(world.allWitnesses()).at(-1).status, "pending");
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
});
