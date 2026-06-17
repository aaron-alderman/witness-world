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

async function openRevisionEvents(url) {
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
          new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for app revision event")), remaining))
        ]);
        if (chunk.done) throw new Error("app revision event stream closed");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      throw new Error("timed out waiting for app revision event");
    },
    async close() {
      controller.abort();
      try {
        await reader.cancel();
      } catch {}
    }
  };
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

test("dev-mode request refresh picks up authored source edits without restart", async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const initial = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initial, /Demo sign-in uses the seeded local identities below\./);

    await replaceShellText(
      app.authShellPath,
      'prop text = "Demo sign-in uses the seeded local identities below."',
      'prop text = "Dev refresh subtitle."'
    );

    const refreshed = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(refreshed, /Dev refresh subtitle/);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("POST source edits persist to disk and rebuild the active snapshot", async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    assert.equal(diagnostics.authoringPolicy.mode, "unconstrained");

    const original = await readShell(app.authShellPath);
    const updated = original.replace(
      'prop text = "Demo sign-in uses the seeded local identities below."',
      'prop text = "POST updated subtitle."'
    );
    assert.notEqual(updated, original);

    const response = await fetch(`${server.url}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [
          {
            path: "app/shell-auth.rvm",
            content: updated
          }
        ]
      })
    }).then(result => result.json());

    assert.equal(response.ok, true);
    assert.equal(typeof response.appRevision, "number");
    assert.match(await readShell(app.authShellPath), /POST updated subtitle/);

    const refreshed = await fetch(`${server.url}/engentus/login`).then(result => result.text());
    assert.match(refreshed, /POST updated subtitle/);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("dev-mode fs.watch updates publish revision SSE and inject dev reload client", { timeout: 120000 }, async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  const events = await openRevisionEvents(`${server.url}/api/runtime/app-revisions/events`);
  try {
    const initialHtmlResponse = await fetch(`${server.url}/engentus/login`);
    const initialHtml = await initialHtmlResponse.text();
    assert.equal(initialHtmlResponse.headers.get("cache-control"), "no-cache");
    assert.match(initialHtml, /Demo sign-in uses the seeded local identities below\./);
    assert.match(initialHtml, /new EventSource\("\/api\/runtime\/app-revisions\/events"\)/);

    const initialEvent = await events.nextEvent({
      predicate: payload => Number(payload.appRevision || 0) >= 1
    });
    const nextWatchEvent = waitForSnapshotEvent(server, {
      predicate: payload => Number(payload.appRevision || 0) > Number(initialEvent.appRevision || 0) && payload.trigger === "watch"
    });

    await replaceShellText(
      app.authShellPath,
      'prop text = "Demo sign-in uses the seeded local identities below."',
      'prop text = "Watcher pushed subtitle."'
    );

    const watchEvent = await nextWatchEvent;
    assert.match((watchEvent.changedSources ?? []).join("\n"), /app\/shell-auth\.rvm/);

    const refreshed = await fetch(`${server.url}/engentus/login`).then(result => result.text());
    assert.match(refreshed, /Watcher pushed subtitle/);
  } finally {
    await events.close();
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
    const platform = createDirectPlatformHandlers(server);
    const initialHtml = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(initialHtml, /Demo sign-in uses the seeded local identities below\./);
    const initialEvent = server.server.runtimeContext.appSnapshotManager.getLastRevisionEvent();

    const original = await readShell(app.authShellPath);
    const updated = original.replace(
      'prop text = "Demo sign-in uses the seeded local identities below."',
      'prop text = "Platform apply subtitle."'
    );
    assert.notEqual(updated, original);

    const changeSetId = `changeSet:platform-runtime-${Date.now().toString(36)}`;
    const branchId = `branch:platform-runtime-${Date.now().toString(36)}`;
    const created = await platform("platform.changeSet.create", {
      body: {
        id: changeSetId,
        branchId,
        title: "Platform apply test",
        reason: "Platform apply runtime snapshot test"
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.changeSet.id, changeSetId);

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
    assert.equal(Array.isArray(staged.body.edits), true);

    const validation = await platform("platform.changeSet.validate", {
      params: { id: changeSetId }
    });
    assert.equal(validation.status, 200);
    assert.equal(validation.body.candidateSnapshot.status, "valid");
    const nextApplyEvent = waitForSnapshotEvent(server, {
      predicate: payload =>
        Number(payload.appRevision || 0) > Number(initialEvent.appRevision || 0)
        && payload.trigger === "platform-change-set-apply"
    });

    const applied = await platform("platform.changeSet.apply", {
      params: { id: changeSetId }
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.changeSet.status, "applied");
    assert.equal(applied.body.runtimeSnapshotRefresh.revisionEvent.trigger, "platform-change-set-apply");

    const revisionEvent = await nextApplyEvent;
    assert.match((revisionEvent.changedSources ?? []).join("\n"), /app\/shell-auth\.rvm/);

    const refreshed = await fetch(`${server.url}/engentus/login`).then(response => response.text());
    assert.match(refreshed, /Platform apply subtitle/);
  } finally {
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
    assert.equal(Array.isArray(applied.body.runtimeSnapshotRefresh.diagnostics.buildErrors), true);
    assert.equal(applied.body.runtimeSnapshotRefresh.diagnostics.buildErrors.length > 0, true);

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
