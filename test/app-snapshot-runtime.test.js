import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import test from "node:test";
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
    shellPath: path.join(examplesRoot, "engentus", "app", "shell.rvm")
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

test("dev-mode request refresh picks up authored source edits without restart", async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  try {
    const initial = await fetch(`${server.url}/engentus/home`).then(response => response.text());
    assert.match(initial, /Select a module to begin analysis/);

    await replaceShellText(
      app.shellPath,
      'prop subtitle = "Select a module to begin analysis"',
      'prop subtitle = "Dev refresh subtitle"'
    );

    const refreshed = await fetch(`${server.url}/engentus/home`).then(response => response.text());
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
    const original = await readShell(app.shellPath);
    const updated = original.replace(
      'prop subtitle = "Select a module to begin analysis"',
      'prop subtitle = "POST updated subtitle"'
    );
    assert.notEqual(updated, original);

    const response = await fetch(`${server.url}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [
          {
            path: "app/shell.rvm",
            content: updated
          }
        ]
      })
    }).then(result => result.json());

    assert.equal(response.ok, true);
    assert.equal(typeof response.appRevision, "number");
    assert.match(await readShell(app.shellPath), /POST updated subtitle/);

    const refreshed = await fetch(`${server.url}/engentus/home`).then(result => result.text());
    assert.match(refreshed, /POST updated subtitle/);
  } finally {
    await server.close();
    await fs.rm(app.root, { recursive: true, force: true });
  }
});

test("dev-mode fs.watch updates publish revision SSE and inject dev reload client", { timeout: 60000 }, async () => {
  const app = await makeTempEngentusApp();
  const server = await startUiServer({
    dslPath: app.dslPath,
    serverRunnerId: "engentus_server"
  });
  const events = await openRevisionEvents(`${server.url}/api/runtime/app-revisions/events`);
  try {
    const initialHtmlResponse = await fetch(`${server.url}/engentus/home`);
    const initialHtml = await initialHtmlResponse.text();
    assert.equal(initialHtmlResponse.headers.get("cache-control"), "no-cache");
    assert.match(initialHtml, /Select a module to begin analysis/);
    assert.match(initialHtml, /new EventSource\("\/api\/runtime\/app-revisions\/events"\)/);

    const initialEvent = await events.nextEvent({
      predicate: payload => Number(payload.appRevision || 0) >= 1
    });

    await replaceShellText(
      app.shellPath,
      'prop subtitle = "Select a module to begin analysis"',
      'prop subtitle = "Watcher pushed subtitle"'
    );

    const watchEvent = await events.nextEvent({
      predicate: payload => Number(payload.appRevision || 0) > Number(initialEvent.appRevision || 0) && payload.trigger === "watch"
    });
    assert.match((watchEvent.changedSources ?? []).join("\n"), /app\/shell\.rvm/);

    const refreshed = await fetch(`${server.url}/engentus/home`).then(result => result.text());
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
