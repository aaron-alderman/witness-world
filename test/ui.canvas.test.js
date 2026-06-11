import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { moduleProjectors } from "../src/modules.js";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

async function loginAsAaron(page) {
  await page.fill("#session-username", "aaron");
  await page.fill("#session-password", "aaron");
  await page.locator("#session-open-btn").click();
  await page.waitForFunction(() => {
    const status = document.getElementById("session-status");
    return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
  });
}

async function createFileTransfer(page, files) {
  const handle = await page.evaluateHandle(() => new DataTransfer());
  await handle.evaluate((dt, rows) => {
    for (const row of rows) {
      dt.items.add(new File([row.body], row.name, { type: row.type }));
    }
  }, files);
  return handle;
}

async function readCanvas(serverUrl, { perspectiveId, cookie }) {
  const response = await fetch(`${serverUrl}/api/canvas?perspective=${encodeURIComponent(perspectiveId)}`, {
    headers: cookie ? { cookie } : {}
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.canvas;
}

async function waitForCanvas(serverUrl, { perspectiveId, cookie, until, timeoutMs = 5000 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const canvas = await readCanvas(serverUrl, { perspectiveId, cookie });
    if (until(canvas)) return canvas;
    await delay(50);
  }
  return readCanvas(serverUrl, { perspectiveId, cookie });
}

async function createCanvasThing(serverUrl, { perspectiveId, cookie, name, x = 120, y = 120 }) {
  const response = await fetch(`${serverUrl}/api/canvas/process`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      process: "canvas.createThing",
      params: { perspective: perspectiveId, name, x, y }
    })
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("canvas uses session-backed login before perspective creation", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");

    await page.locator("#session-status").waitFor();
    assert.equal(await page.locator("#actor-select").count(), 0);
    assert.match((await page.locator("#session-status").textContent()) || "", /Not signed in/);

    await loginAsAaron(page);

    await page.locator("#new-perspective-btn").click();
    await page.locator("#overlay-input").fill("Canvas Session");
    await page.locator("#overlay-input").press("Enter");

    await page.waitForFunction(() => {
      const select = document.getElementById("perspective-select");
      return Boolean(select && select.value);
    });

    const sessionValue = (await page.locator("#session-status").textContent()) || "";
    assert.match(sessionValue, /Signed in as Aaron/);
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas drag and drop uploads a file into the current context-backed perspective", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");

    await loginAsAaron(page);

    const ids = await page.evaluate(async () => {
      const contextId = "context:ui-drop";
      const perspectiveId = "perspective:ui-drop";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Drop" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Drop Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const cookie = await page.evaluate(() => document.cookie);

    const dataTransfer = await createFileTransfer(page, [
      { name: "dropped.txt", type: "text/plain", body: "drop body" }
    ]);

    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-ready") === true);
    await page.dispatchEvent("#canvas-stage", "dragover", { dataTransfer, clientX: 280, clientY: 220 });
    await page.dispatchEvent("#canvas-stage", "drop", { dataTransfer, clientX: 280, clientY: 220 });

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.some(instance => instance.label === "dropped.txt" && instance.kind === "asset")
    });
    const assetNode = canvas.instances.find(instance => instance.label === "dropped.txt" && instance.kind === "asset");
    assert(assetNode);
    assert.equal(assetNode.asset.mimeType, "text/plain");
    assert.equal(assetNode.asset.context, ids.contextId);
    await page.waitForFunction(() => {
      const panel = document.getElementById("thing-props");
      return Boolean(
        panel
        && panel.textContent?.includes("Download file")
        && panel.textContent?.includes("drop body")
      );
    });
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas marks file drop as disabled when no authenticated perspective target exists", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");

    const dataTransfer = await createFileTransfer(page, [
      { name: "blocked.txt", type: "text/plain", body: "blocked" }
    ]);
    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-disabled") === true);
    assert.equal(await page.locator("#canvas-stage").evaluate(node => node.classList.contains("drop-ready")), false);
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas drag and drop supports multiple files with offset placement and asset content links", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);

    const ids = await page.evaluate(async () => {
      const contextId = "context:ui-multi";
      const perspectiveId = "perspective:ui-multi";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Multi" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Multi Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const cookie = await page.evaluate(() => document.cookie);

    const dataTransfer = await createFileTransfer(page, [
      { name: "alpha.txt", type: "text/plain", body: "alpha body" },
      { name: "beta.txt", type: "text/plain", body: "beta body" }
    ]);

    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-ready") === true);
    await page.dispatchEvent("#canvas-stage", "dragover", { dataTransfer, clientX: 280, clientY: 220 });
    await page.dispatchEvent("#canvas-stage", "drop", { dataTransfer, clientX: 280, clientY: 220 });

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.filter(instance => instance.kind === "asset").length >= 2
    });
    const assetNodes = canvas.instances.filter(instance => instance.kind === "asset").sort((a, b) => a.label.localeCompare(b.label));
    assert.equal(assetNodes.length, 2);
    assert.equal(assetNodes[0].label, "alpha.txt");
    assert.equal(assetNodes[1].label, "beta.txt");
    assert.equal(assetNodes[0].asset.context, ids.contextId);
    assert.equal(assetNodes[1].asset.context, ids.contextId);
    assert.equal(assetNodes[0].asset.mimeType, "text/plain");
    assert.equal(assetNodes[1].asset.mimeType, "text/plain");
    assert.equal(assetNodes[1].x - assetNodes[0].x, 24);
    assert.equal(assetNodes[1].y - assetNodes[0].y, 24);

    const contentBody = await page.evaluate(async href => {
      const response = await fetch(href);
      return response.text();
    }, assetNodes[0].asset.contentUrl);
    assert.equal(contentBody, "alpha body");
    await page.waitForFunction(() => {
      const panel = document.getElementById("thing-props");
      return Boolean(panel && panel.textContent?.includes("Download file"));
    });
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas drag and drop into a contextless perspective falls back to the actor Files context", async () => {
  const { world, server, close: closeServer } = await startUiDemoServer({
    extraWitnessToml: `
[[identity]]
actor = "aaron"
id = "identity.aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homeContext = "context:aaron-home"
homePerspective = "aaron:personal"

[[context]]
actor = "aaron"
id = "context:aaron-home"
label = "Aaron Home"

[[perspective]]
actor = "aaron"
id = "perspective:ui-fallback"
title = "UI Fallback"
`
  });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", "perspective:ui-fallback");
    const cookie = await page.evaluate(() => document.cookie);

    const dataTransfer = await createFileTransfer(page, [
      { name: "fallback.txt", type: "text/plain", body: "fallback body" }
    ]);
    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-ready") === true);
    await page.dispatchEvent("#canvas-stage", "dragover", { dataTransfer, clientX: 260, clientY: 200 });
    await page.dispatchEvent("#canvas-stage", "drop", { dataTransfer, clientX: 260, clientY: 200 });

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: "perspective:ui-fallback",
      cookie,
      until: current => current.instances.some(instance => instance.label === "fallback.txt" && instance.kind === "asset")
    });
    const assetNode = canvas.instances.find(instance => instance.label === "fallback.txt" && instance.kind === "asset");
    assert(assetNode);
    const filesContextId = "context:context:aaron-home:files";
    assert.equal(assetNode.asset.context, filesContextId);

    const filesContexts = world.project(moduleProjectors.contexts).filter(row => row.id === filesContextId);
    assert.equal(filesContexts.length, 1);
    assert.equal(filesContexts[0].label, "Files");
    assert.equal(filesContexts[0].parent, "context:aaron-home");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas inspector can attach a dropped asset to another world thing", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");

    await loginAsAaron(page);

    const ids = await page.evaluate(async () => {
      const contextId = "context:ui-attach";
      const perspectiveId = "perspective:ui-attach";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Attach" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Attach Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    let cookie = await page.evaluate(() => document.cookie);

    const created = await createCanvasThing(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      name: "Proposal",
      x: 120,
      y: 120
    });
    const proposalThing = created.witness.body.thing;

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    cookie = await page.evaluate(() => document.cookie);

    const dataTransfer = await createFileTransfer(page, [
      { name: "attachable.txt", type: "text/plain", body: "attach body" }
    ]);

    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-ready") === true);
    await page.dispatchEvent("#canvas-stage", "dragover", { dataTransfer, clientX: 320, clientY: 220 });
    await page.dispatchEvent("#canvas-stage", "drop", { dataTransfer, clientX: 320, clientY: 220 });

    await page.waitForFunction(() => {
      const select = document.querySelector('[data-asset-attach-target="true"]');
      return Boolean(select);
    });
    await page.selectOption('[data-asset-attach-target="true"]', proposalThing);
    await page.locator('[data-asset-attach-button]').click();

    await page.waitForFunction(targetId => {
      const panel = document.getElementById("thing-props");
      return Boolean(panel && panel.textContent?.includes("attached to " + targetId));
    }, proposalThing);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.some(instance => instance.thing === proposalThing && instance.attachedAssets?.length === 1)
    });
    const proposalNode = canvas.instances.find(instance => instance.thing === proposalThing);
    assert(proposalNode);
    assert.equal(proposalNode.attachedAssets.length, 1);
    assert.equal(proposalNode.attachedAssets[0].title, "attachable.txt");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
