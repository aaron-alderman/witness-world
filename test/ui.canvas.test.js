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

function samplePdfBody(text) {
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 39 >>
stream
BT
/F1 12 Tf
72 72 Td
(${text}) Tj
ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;
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

async function createCanvasThing(page, { perspectiveId, name, x = 120, y = 120 }) {
  const result = await page.evaluate(async ({ perspectiveId, name, x, y }) => {
    const response = await fetch("/api/canvas/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        process: "canvas.createThing",
        params: { perspective: perspectiveId, name, x, y }
      })
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({}))
    };
  }, { perspectiveId, name, x, y });
  assert.equal(result.status, 200);
  return result.body;
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

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
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

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.some(instance => instance.label === "attachable.txt" && instance.kind === "asset")
    });
    const assetNode = canvas.instances.find(instance => instance.label === "attachable.txt" && instance.kind === "asset");
    assert(assetNode);

    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(assetNode.x + Math.min(assetNode.w / 2, 40))),
        y: Math.max(8, Math.round(assetNode.y + Math.min(assetNode.h / 2, 20)))
      }
    });
    await page.waitForFunction(() => {
      const select = document.querySelector('[data-asset-attach-target="true"]');
      return Boolean(select);
    });
    await page.selectOption('[data-asset-attach-target="true"]', proposalThing);
    await page.locator('[data-asset-attach-button]').click();

    const updatedCanvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.some(instance => instance.thing === proposalThing && instance.attachedAssets?.length === 1)
    });
    const updatedAssetNode = updatedCanvas.instances.find(instance => instance.label === "attachable.txt" && instance.kind === "asset");
    const proposalNode = updatedCanvas.instances.find(instance => instance.thing === proposalThing);
    assert(updatedAssetNode);
    assert(proposalNode);
    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(updatedAssetNode.x + Math.min(updatedAssetNode.w / 2, 40))),
        y: Math.max(8, Math.round(updatedAssetNode.y + Math.min(updatedAssetNode.h / 2, 20)))
      }
    });
    await page.waitForFunction(() => {
      const panel = document.getElementById("thing-props");
      const text = panel?.textContent || "";
      return text.includes("attached to Proposal") && text.includes("UI Attach");
    });
    assert.equal(proposalNode.attachedAssets.length, 1);
    assert.equal(proposalNode.attachedAssets[0].title, "attachable.txt");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas inspector previews derived PDF text for a dropped asset", async () => {
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
      const contextId = "context:ui-pdf";
      const perspectiveId = "perspective:ui-pdf";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI PDF" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI PDF Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await loginAsAaron(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const cookie = await page.evaluate(() => document.cookie);

    const dataTransfer = await createFileTransfer(page, [
      { name: "brief.pdf", type: "application/pdf", body: samplePdfBody("Phase Six Preview") }
    ]);
    await page.dispatchEvent("#canvas-stage", "dragenter", { dataTransfer });
    await page.waitForFunction(() => document.getElementById("canvas-stage")?.classList.contains("drop-ready") === true);
    await page.dispatchEvent("#canvas-stage", "dragover", { dataTransfer, clientX: 280, clientY: 220 });
    await page.dispatchEvent("#canvas-stage", "drop", { dataTransfer, clientX: 280, clientY: 220 });

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie,
      until: current => current.instances.some(instance => instance.label === "brief.pdf" && instance.asset?.processingStatus === "succeeded" && typeof instance.asset?.textUrl === "string")
    });
    const assetNode = canvas.instances.find(instance => instance.label === "brief.pdf");
    assert(assetNode);
    assert(assetNode.asset?.id);

    await page.waitForFunction(assetThingId => {
      const panel = document.getElementById("thing-props");
      const selectedThing = panel?.querySelector(".prop-id")?.textContent;
      const hasName = [...(panel?.querySelectorAll("input") || [])].some(input => input.value === "brief.pdf");
      return Boolean(panel && selectedThing === assetThingId && hasName);
    }, assetNode.thing);
    await page.waitForFunction(assetId => {
      const panel = document.getElementById("thing-props");
      const link = panel?.querySelector(`a[href="/api/assets/${assetId}/text"]`);
      return Boolean(panel && link && panel.textContent?.includes("Derived text"));
    }, assetNode.asset.id);
    await page.waitForFunction(() => {
      const panel = document.getElementById("thing-props");
      const preview = panel?.querySelector(".asset-preview");
      return Boolean(preview && preview.textContent?.includes("Phase Six Preview"));
    });
    await page.waitForFunction(() => {
      return [...document.querySelectorAll("#thing-props .prop-row")].some(row => {
        return row.querySelector("label")?.textContent === "Pages"
          && row.querySelector("input")?.value === "1";
      });
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
