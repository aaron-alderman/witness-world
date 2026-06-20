import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import test from "node:test";
import { createPlatformHandlers } from "../plugins/platform/handlers.js";
import { startUiServer } from "./support/harness.js";

async function makeTempEngentusApp() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-engentus-dev-"));
  const examplesRoot = path.join(root, "examples");
  await fs.mkdir(examplesRoot, { recursive: true });
  await fs.cp(path.join(process.cwd(), "examples", "engentus"), path.join(examplesRoot, "engentus"), { recursive: true });
  await fs.cp(path.join(process.cwd(), "examples", "_lib"), path.join(examplesRoot, "_lib"), { recursive: true });
  return {
    root,
    dslPath: path.join(examplesRoot, "engentus", "app.wtoml"),
    shellPath: path.join(examplesRoot, "engentus", "app", "shell-shared.rvm"),
    authShellPath: path.join(examplesRoot, "engentus", "app", "shell-auth.rvm")
  };
}

async function makeWorkspaceEngentusApp() {
  const root = path.join(
    process.cwd(),
    "test",
    `.platform-engentus-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
  );
  const examplesRoot = path.join(root, "examples");
  await fs.mkdir(examplesRoot, { recursive: true });
  await fs.cp(path.join(process.cwd(), "examples", "engentus"), path.join(examplesRoot, "engentus"), { recursive: true });
  await fs.cp(path.join(process.cwd(), "examples", "_lib"), path.join(examplesRoot, "_lib"), { recursive: true });
  return {
    root,
    dslPath: path.join(examplesRoot, "engentus", "app.wtoml"),
    shellPath: path.join(examplesRoot, "engentus", "app", "shell-shared.rvm"),
    authShellPath: path.join(examplesRoot, "engentus", "app", "shell-auth.rvm")
  };
}

async function makeTempLiveCoreFixtureApp() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-live-core-dev-"));
  const fixtureRoot = path.join(root, "live-core-app");
  await fs.cp(path.join(process.cwd(), "test", "fixtures", "live-core-app"), fixtureRoot, { recursive: true });
  return {
    root,
    dslPath: path.join(fixtureRoot, "app.wtoml"),
    contentPath: path.join(fixtureRoot, "app", "content.wtoml"),
    routePath: "/live-core"
  };
}

async function readShell(shellPath) {
  return fs.readFile(shellPath, "utf8");
}

async function replaceShellText(shellPath, currentText, nextText) {
  const before = await readShell(shellPath);
  const after = before.replace(currentText, nextText);
  assert.notEqual(after, before, `expected to replace ${currentText}`);
  await fs.writeFile(shellPath, after, "utf8");
  return after;
}

function repoRelative(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function createDirectPlatformHandlers(server) {
  const responses = [];
  const handlers = createPlatformHandlers({
    world: server.world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    sendGateFailure: () => {},
    send: () => {},
    sendJson: (_res, status, body) => {
      responses.push({ status, body });
    }
  });
  return async (handlerId, {
    body = null,
    params = {},
    requestActor = "adam",
    requestSession = { id: "session.platform" }
  } = {}) => {
    const before = responses.length;
    await handlers[handlerId]({
      req: body == null ? null : { body },
      res: {},
      params,
      requestActor,
      requestSession,
      appContext: server.server.runtimeContext
    });
    assert.equal(responses.length, before + 1, `expected ${handlerId} to send JSON`);
    return responses.at(-1);
  };
}

async function openEventStream(url, label = "event") {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/i);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consumeFrame = predicate => {
    buffer = buffer.replaceAll("\r\n", "\n");
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) return null;
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      const payload = JSON.parse(data);
      if (!predicate(payload)) continue;
      return payload;
    }
  };
  return {
    async nextEvent({
      timeout = 15000,
      predicate = () => true
    } = {}) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const frame = consumeFrame(predicate);
        if (frame) return frame;
        const remaining = Math.max(1, deadline - Date.now());
        const chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), remaining))
        ]);
        if (chunk.done) throw new Error(`${label} stream closed`);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      throw new Error(`timed out waiting for ${label}`);
    },
    async close() {
      controller.abort();
      try {
        await reader.cancel();
      } catch {}
    }
  };
}

function openRevisionEvents(url) {
  return openEventStream(url, "app revision event");
}

function openBackendRevisionEvents(url) {
  return openEventStream(url, "backend revision event");
}

function waitForSnapshotEvent(server, {
  timeout = 60000,
  predicate = () => true
} = {}) {
  const snapshotManager = server.server.runtimeContext?.appSnapshotManager;
  assert.ok(snapshotManager, "expected a live app snapshot manager");
  const current = snapshotManager.getLastRevisionEvent?.() ?? null;
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("timed out waiting for app revision event"));
    }, timeout);
    timer.unref?.();
    const unsubscribe = snapshotManager.subscribe(event => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

async function waitForSnapshotManagerReady(server) {
  const ready = server.server.runtimeContext?.appSnapshotManagerReady;
  if (ready && typeof ready.then === "function") {
    await ready;
  }
  assert.ok(server.server.runtimeContext?.appSnapshotManager, "expected app snapshot manager to be ready");
}

async function waitForText(url, pattern, {
  timeout = 15000
} = {}) {
  const deadline = Date.now() + timeout;
  let last = "";
  while (Date.now() < deadline) {
    last = await fetch(url).then(response => response.text());
    if (pattern.test(last)) return last;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.match(last, pattern);
  return last;
}

async function postJsonWithRetry(url, body, {
  timeout = 10000,
  retryStatuses = [404]
} = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!retryStatuses.includes(response.status)) return response;
    last = response;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return last;
}

async function createValidatedSubtitleChangeSet(server, app, subtitleText) {
  const platform = createDirectPlatformHandlers(server);
  const original = await readShell(app.authShellPath);
  const updated = original.replace(
    'prop text = "Demo sign-in uses the seeded local identities below."',
    `prop text = "${subtitleText}"`
  );
  assert.notEqual(updated, original);
  const changeSetId = `changeSet:platform-runtime-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const branchId = `branch:platform-runtime-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const created = await platform("platform.changeSet.create", {
    body: {
      id: changeSetId,
      branchId,
      title: "Platform apply test",
      reason: "Platform apply runtime snapshot test"
    }
  });
  assert.equal(created.status, 201);
  const staged = await platform("platform.changeSet.edit", {
    body: {
      edits: [
        {
          path: repoRelative(app.authShellPath),
          content: updated
        }
      ]
    },
    params: { id: changeSetId }
  });
  assert.equal(staged.status, 200);
  const validation = await platform("platform.changeSet.validate", {
    params: { id: changeSetId }
  });
  assert.equal(validation.status, 200);
  assert.equal(validation.body.candidateSnapshot.status, "valid");
  return { platform, changeSetId, branchId, updated };
}

test("dev-mode request refresh picks up authored source edits without restart", async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    await waitForSnapshotManagerReady(server);
    const initial = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initial, /Demo sign-in uses the seeded local identities below\./);

    await replaceShellText(
      app.authShellPath,
      'prop text = "Demo sign-in uses the seeded local identities below."',
      'prop text = "Dev refresh subtitle."'
    );

    const refreshed = await waitForText(`${server.url}/engentus/login`, /Dev refresh subtitle/);
    assert.match(refreshed, /Dev refresh subtitle/);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("dev-mode keeps local dirty polling disabled by default and requires explicit reload", { timeout: 120000 }, async () => {
  const app = await makeTempLiveCoreFixtureApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "fixture_server",
    runtimeProfile: "minimal"
  });
  let events = null;
  try {
    await waitForSnapshotManagerReady(server);
    const health = await fetch(`${server.url}/api/runtime/process-health`).then(response => response.json());
    assert.equal(health.watchersEnabled, false);
    const initialRevision = Number(
      server.server.runtimeContext.appSnapshotManager?.getLastRevisionEvent?.().appRevision || 0
    );
    events = await openRevisionEvents(`${server.url}/api/runtime/app-revisions/events`);

    await replaceShellText(
      app.contentPath,
      'text = "Live Core Baseline"',
      'text = "Live Core Manual Reload"'
    );

    await new Promise(resolve => setTimeout(resolve, 700));
    const unchanged = await fetch(`${server.url}${app.routePath}`).then(response => response.text());
    assert.match(unchanged, /Live Core Baseline/);
    assert.doesNotMatch(unchanged, /Live Core Manual Reload/);

    const nextReloadEvent = waitForSnapshotEvent(server, {
      predicate: payload => Number(payload.appRevision || 0) > initialRevision && payload.trigger === "reload"
    });
    const nextReloadSseEvent = events.nextEvent({
      predicate: payload => Number(payload.appRevision || 0) > initialRevision && payload.trigger === "reload"
    });

    const reloadResponse = await fetch(`${server.url}/api/runtime/app-snapshot/reload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths: ["app/content.wtoml"] })
    });
    assert.equal(reloadResponse.status, 200);
    const reloadBody = await reloadResponse.json();
    assert.equal(reloadBody.ok, true);
    assert.equal(reloadBody.watchersEnabled, false);

    const [reloadEvent, reloadSseEvent] = await Promise.all([nextReloadEvent, nextReloadSseEvent]);
    assert.match((reloadEvent.changedSources ?? []).join("\n"), /app\/content\.wtoml/);
    assert.match((reloadSseEvent.changedSources ?? []).join("\n"), /app\/content\.wtoml/);

    const refreshed = await waitForText(`${server.url}${app.routePath}`, /Live Core Manual Reload/);
    assert.match(refreshed, /Live Core Manual Reload/);
  } finally {
    await events?.close?.();
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("dev-mode dirty polling updates publish revision SSE and inject dev reload client only when explicitly enabled", { timeout: 120000 }, async () => {
  const app = await makeTempLiveCoreFixtureApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "fixture_server",
    runtimeProfile: "minimal",
    env: {
      ...process.env,
      WITNESS_RUNTIME_WATCHERS_ENABLED: "true"
    }
  });
  let events = null;
  try {
    await waitForSnapshotManagerReady(server);
    const health = await fetch(`${server.url}/api/runtime/process-health`).then(response => response.json());
    assert.equal(health.watchersEnabled, true);
    const initialRevision = Number(
      server.server.runtimeContext.appSnapshotManager?.getLastRevisionEvent?.().appRevision || 0
    );
    events = await openRevisionEvents(`${server.url}/api/runtime/app-revisions/events`);
    const initialHtmlResponse = await fetch(`${server.url}${app.routePath}`);
    const initialHtml = await initialHtmlResponse.text();
    assert.equal(initialHtmlResponse.headers.get("cache-control"), "no-cache");
    assert.match(initialHtml, /Live Core Baseline/);
    assert.match(initialHtml, /new EventSource\("\/api\/runtime\/app-revisions\/events"\)/);

    const nextWatchEvent = waitForSnapshotEvent(server, {
      predicate: payload => Number(payload.appRevision || 0) > initialRevision && payload.trigger === "watch"
    });
    const nextSseEvent = events.nextEvent({
      predicate: payload => Number(payload.appRevision || 0) > initialRevision && payload.trigger === "watch"
    });

    await replaceShellText(
      app.contentPath,
      'text = "Live Core Baseline"',
      'text = "Live Core Poller"'
    );

    const [watchEvent, sseEvent] = await Promise.all([nextWatchEvent, nextSseEvent]);
    assert.match((watchEvent.changedSources ?? []).join("\n"), /app\/content\.wtoml/);
    assert.match((sseEvent.changedSources ?? []).join("\n"), /app\/content\.wtoml/);

    const refreshed = await waitForText(`${server.url}${app.routePath}`, /Live Core Poller/);
    assert.match(refreshed, /Live Core Poller/);
  } finally {
    await events?.close?.();
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("release mode disables app revision dev hooks", async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server",
    devMode: false
  });
  try {
    const page = await fetch(`${server.url}/engentus/home`);
    const html = await page.text();
    assert.notEqual(page.headers.get("cache-control"), "no-cache");
    assert.doesNotMatch(html, /app-revisions\/events/);

    const events = await fetch(`${server.url}/api/runtime/app-revisions/events`);
    assert.equal(events.status, 404);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("platform change-set apply activates a new app revision without restart", { timeout: 120000 }, async () => {
  const app = await makeWorkspaceEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const initialHtml = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initialHtml, /Demo sign-in uses the seeded local identities below\./);
    const initialEvent = server.server.runtimeContext.appSnapshotManager.getLastRevisionEvent();

    const { platform, changeSetId, branchId } = await createValidatedSubtitleChangeSet(
      server,
      app,
      "Platform apply subtitle."
    );
    const nextApplyEvent = waitForSnapshotEvent(server, {
      timeout: 120000,
      predicate: payload =>
        Number(payload.appRevision || 0) > Number(initialEvent.appRevision || 0)
        && payload.trigger === "platform-change-set-apply"
        && payload.changeSetId === changeSetId
    });

    const applied = await platform("platform.changeSet.apply", {
      params: { id: changeSetId }
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.changeSet.status, "applied");
    if (applied.body.runtimeSnapshotRefresh?.revisionEvent) {
      assert.equal(applied.body.runtimeSnapshotRefresh.revisionEvent.trigger, "platform-change-set-apply");
      assert.equal(applied.body.runtimeSnapshotRefresh.revisionEvent.branchId, branchId);
      assert.equal(applied.body.runtimeSnapshotRefresh.revisionEvent.changeSetId, changeSetId);
    }

    const revisionEvent = await nextApplyEvent;
    assert.equal(revisionEvent.branchId, branchId);
    assert.equal(revisionEvent.changeSetId, changeSetId);
    assert.match((revisionEvent.changedSources ?? []).join("\n"), /app\/shell-auth\.rvm/);

    const refreshed = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(refreshed, /Platform apply subtitle/);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("backend revision SSE publishes activation metadata after platform change-set apply", { timeout: 120000 }, async () => {
  const app = await makeWorkspaceEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  const events = await openBackendRevisionEvents(`${server.url}/api/runtime/backend-revisions/events`);
  try {
    const initial = await events.nextEvent({
      predicate: payload => Number(payload.revision || 0) >= 1
    });
    assert.equal(initial.status, "active");

    const { platform, changeSetId, branchId } = await createValidatedSubtitleChangeSet(
      server,
      app,
      "Backend SSE subtitle."
    );

    const nextActivation = waitForSnapshotEvent(server, {
      timeout: 120000,
      predicate: payload =>
        Number(payload.appRevision || 0) > Number(initial.revision || 0)
        && payload.changeSetId === changeSetId
    });
    const nextEvent = events.nextEvent({
      timeout: 120000,
      predicate: payload =>
        Number(payload.revision || 0) > Number(initial.revision || 0)
        && payload.changeSet === changeSetId
    });

    const applied = await platform("platform.changeSet.apply", {
      params: { id: changeSetId }
    });
    assert.equal(applied.status, 200);

    await nextActivation;
    const activated = await nextEvent;
    assert.equal(activated.branch, branchId);
    assert.equal(activated.changeSet, changeSetId);
    assert.equal(activated.trigger, "platform-change-set-apply");
    assert.equal(activated.status, "active");
    assert.match((activated.changedSources ?? []).join("\n"), /app\/shell-auth\.rvm/);
  } finally {
    await events.close();
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("failed app rebuild after platform apply preserves the last good runtime revision", async () => {
  const app = await makeWorkspaceEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const platform = createDirectPlatformHandlers(server);
    const initialDiagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    const initialRevision = Number(initialDiagnostics.appSnapshot?.appRevision || 0);
    const initialHtml = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initialHtml, /Demo sign-in uses the seeded local identities below\./);

    const originalManifest = await fs.readFile(app.dslPath, "utf8");
    const brokenManifest = originalManifest.replace(
      '"./app/shell.rvm"]',
      '"./app/shell.rvm", "./app/missing-platform-runtime.rvm"]'
    );
    assert.notEqual(brokenManifest, originalManifest);

    const changeSetId = `changeSet:platform-runtime-broken-${Date.now().toString(36)}`;
    const branchId = `branch:platform-runtime-broken-${Date.now().toString(36)}`;
    const created = await platform("platform.changeSet.create", {
      body: {
        id: changeSetId,
        branchId,
        title: "Platform apply test",
        reason: "Platform apply runtime snapshot test"
      }
    });
    assert.equal(created.status, 201);

    const staged = await platform("platform.changeSet.edit", {
      body: {
        edits: [
          {
            path: repoRelative(app.dslPath),
            content: brokenManifest
          }
        ]
      },
      params: { id: changeSetId }
    });
    assert.equal(staged.status, 200);

    const validation = await platform("platform.changeSet.validate", {
      params: { id: changeSetId }
    });
    assert.equal(validation.status, 200);
    assert.equal(validation.body.candidateSnapshot.status, "valid");

    const applied = await platform("platform.changeSet.apply", {
      params: { id: changeSetId }
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.changeSet.status, "applied");
    if (applied.body.runtimeSnapshotRefresh?.diagnostics) {
      assert.equal(Array.isArray(applied.body.runtimeSnapshotRefresh.diagnostics.buildErrors), true);
      assert.equal(applied.body.runtimeSnapshotRefresh.diagnostics.buildErrors.length > 0, true);
    }

    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    assert.equal(Number(diagnostics.appSnapshot?.appRevision || 0), initialRevision);
    assert.equal(Array.isArray(diagnostics.appSnapshot?.buildErrors), true);
    assert.equal(diagnostics.appSnapshot.buildErrors.length > 0, true);

    const refreshed = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(refreshed, /Demo sign-in uses the seeded local identities below\./);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("invalid RVM source preserves the last good runtime revision on request refresh", async () => {
  const app = await makeWorkspaceEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const initialDiagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    const initialRevision = Number(initialDiagnostics.appSnapshot?.appRevision || 0);
    const initialHtml = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initialHtml, /Demo sign-in uses the seeded local identities below\./);

    const originalSource = await fs.readFile(app.authShellPath, "utf8");
    const brokenSource = `${originalSource}\nview EngentusBrokenLoginPanel {\n  kind text\n`;
    await fs.writeFile(app.authShellPath, brokenSource, "utf8");

    const refreshedHtml = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());

    assert.equal(Number(diagnostics.appSnapshot?.appRevision || 0), initialRevision);
    assert.equal(Array.isArray(diagnostics.appSnapshot?.buildErrors), true);
    assert.equal(diagnostics.appSnapshot.buildErrors.length > 0, true);
    assert.match(diagnostics.appSnapshot.buildErrors[0].message, /unterminated RVM block/i);
    assert.match(refreshedHtml, /Demo sign-in uses the seeded local identities below\./);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});
