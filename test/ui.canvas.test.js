import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { moduleProjectors } from "../src/modules.js";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

async function loginAs(page, { username, password = username, label }) {
  await page.fill("#session-username", username);
  await page.fill("#session-password", password);
  await page.locator("#session-open-btn").click();
  await page.waitForFunction(expectedLabel => {
    const status = document.getElementById("session-status");
    return Boolean(status && status.textContent && status.textContent.includes(`Signed in as ${expectedLabel}`));
  }, label);
  const statusText = (await page.locator("#session-status").textContent()) || "";
  assert.match(statusText, new RegExp(`Signed in as ${label}`));
}

async function loginAsAaron(page) {
  await loginAs(page, { username: "aaron", label: "Aaron" });
}

async function loginAsCallan(page) {
  await loginAs(page, { username: "callan", label: "Callan" });
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

test("canvas live surface proposes shared title edits for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared";
      const perspectiveId = "perspective:ui-shared";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Customer",
      x: 120,
      y: 120
    });
    const sharedThing = created.witness.body.thing;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing)
    });
    const sharedNode = canvas.instances.find(instance => instance.thing === sharedThing);
    assert(sharedNode);

    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(sharedNode.x + Math.min(sharedNode.w / 2, 40))),
        y: Math.max(8, Math.round(sharedNode.y + Math.min(sharedNode.h / 2, 20)))
      }
    });
    const nameInput = page.locator("#thing-props .prop-row input").first();
    await nameInput.fill("Hijacked Customer");
    await nameInput.press("Tab");
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas title update for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.some(instance => instance.label === "Hijacked Customer"), false);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.thing.setTitle" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared thing creation for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-create";
      const perspectiveId = "perspective:ui-shared-create";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Create" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Create Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    await page.locator("#canvas-stage").dblclick({ position: { x: 260, y: 180 } });
    await page.locator("#overlay-input").fill("Hijacked Shared Thing");
    await page.locator("#overlay-input").press("Enter");
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas thing for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.some(instance => instance.label === "Hijacked Shared Thing"), false);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.createThing" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared asset attachments for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-attach";
      const perspectiveId = "perspective:ui-shared-attach";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Attach" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Attach Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Attachment Target",
      x: 120,
      y: 120
    });
    const sharedThing = created.witness.body.thing;

    const uploaded = await page.evaluate(async ({ perspectiveId }) => {
      const form = new FormData();
      form.set("file", new File(["proposal attach body"], "shared-attach.txt", { type: "text/plain" }));
      form.set("perspective", perspectiveId);
      const response = await fetch(`/api/assets?perspective=${encodeURIComponent(perspectiveId)}`, {
        method: "POST",
        body: form
      });
      return {
        status: response.status,
        body: await response.json().catch(() => ({}))
      };
    }, { perspectiveId: ids.perspectiveId });
    assert.equal(uploaded.status, 201);
    const uploadedAssetId = uploaded.body.asset.id;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing)
    });
    const targetNode = canvas.instances.find(instance => instance.thing === sharedThing);
    assert(targetNode);

    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(targetNode.x + Math.min(targetNode.w / 2, 40))),
        y: Math.max(8, Math.round(targetNode.y + Math.min(targetNode.h / 2, 20)))
      }
    });
    await page.waitForFunction(expectedAssetId => {
      const select = document.querySelector('[data-attach-asset-select="true"]');
      return Boolean(select && [...select.options].some(option => option.value === expectedAssetId));
    }, uploadedAssetId);
    await page.selectOption('[data-attach-asset-select="true"]', uploadedAssetId);
    await page.locator('[data-attach-asset-button]').click();
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed asset attachment for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    const afterTargetNode = after.instances.find(instance => instance.thing === sharedThing);
    assert(afterTargetNode);
    assert.equal(afterTargetNode.attachedAssets?.length || 0, 0);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "asset.attach" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared layout changes for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-batch";
      const perspectiveId = "perspective:ui-shared-batch";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Batch" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Batch Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Batch Customer",
      x: 120,
      y: 120
    });
    const sharedInstance = created.witness.body.instance;
    const sharedThing = created.witness.body.thing;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing)
    });
    const sharedNode = canvas.instances.find(instance => instance.thing === sharedThing);
    assert(sharedNode);
    const stageBox = await page.locator("#canvas-stage").boundingBox();
    assert(stageBox);

    await page.mouse.move(
      stageBox.x + Math.max(8, Math.round(sharedNode.x + Math.min(sharedNode.w / 2, 40))),
      stageBox.y + Math.max(8, Math.round(sharedNode.y + Math.min(sharedNode.h / 2, 20)))
    );
    await page.mouse.down();
    await page.mouse.move(
      stageBox.x + Math.max(8, Math.round(sharedNode.x + Math.min(sharedNode.w / 2, 40) + 120)),
      stageBox.y + Math.max(8, Math.round(sharedNode.y + Math.min(sharedNode.h / 2, 20) + 80)),
      { steps: 10 }
    );
    await page.mouse.up();

    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas layout change for review."));
    }, { timeout: 10000 });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.find(instance => instance.id === sharedInstance)?.x, sharedNode.x);
    assert.equal(after.instances.find(instance => instance.id === sharedInstance)?.y, sharedNode.y);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.batch" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared duplication for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-duplicate";
      const perspectiveId = "perspective:ui-shared-duplicate";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Duplicate" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Duplicate Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Duplicate Customer",
      x: 120,
      y: 120
    });
    const sharedInstance = created.witness.body.instance;
    const sharedThing = created.witness.body.thing;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing)
    });
    const sharedNode = canvas.instances.find(instance => instance.thing === sharedThing);
    assert(sharedNode);
    const stageBox = await page.locator("#canvas-stage").boundingBox();
    assert(stageBox);

    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(sharedNode.x + Math.min(sharedNode.w / 2, 40))),
        y: Math.max(8, Math.round(sharedNode.y + Math.min(sharedNode.h / 2, 20)))
      }
    });
    await page.keyboard.press("Control+d");
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas duplicate for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.filter(instance => instance.thing === sharedThing).length, 1);
    assert.equal(after.instances.some(instance => instance.id !== sharedInstance && instance.thing === sharedThing), false);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.duplicate" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared placement for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-place";
      const perspectiveId = "perspective:ui-shared-place";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Place" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Place Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Place Customer",
      x: 120,
      y: 120
    });
    const sharedThing = created.witness.body.thing;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing) && current.availableThings.some(thing => thing.id === sharedThing)
    });
    assert.equal(canvas.instances.filter(instance => instance.thing === sharedThing).length, 1);

    await page.locator('.palette-item').filter({ hasText: 'Shared Place Customer' }).click();
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas placement for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.filter(instance => instance.thing === sharedThing).length, 1);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.place" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("canvas live surface proposes shared removal for signed-in non-stewards", async () => {
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
      const contextId = "context:ui-shared-remove";
      const perspectiveId = "perspective:ui-shared-remove";
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contextId, label: "UI Shared Remove" })
      });
      await fetch("/api/perspectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: perspectiveId, title: "UI Shared Remove Perspective", context: contextId })
      });
      return { contextId, perspectiveId };
    });

    const created = await createCanvasThing(page, {
      perspectiveId: ids.perspectiveId,
      name: "Shared Remove Customer",
      x: 120,
      y: 120
    });
    const sharedInstance = created.witness.body.instance;
    const sharedThing = created.witness.body.thing;

    await page.locator("#session-logout-btn").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent?.includes("Not signed in"));
    });
    await loginAsCallan(page);
    await page.selectOption("#perspective-select", ids.perspectiveId);
    const callanCookie = await page.evaluate(() => document.cookie);

    const canvas = await waitForCanvas(server.url, {
      perspectiveId: ids.perspectiveId,
      cookie: callanCookie,
      until: current => current.instances.some(instance => instance.thing === sharedThing)
    });
    const sharedNode = canvas.instances.find(instance => instance.thing === sharedThing);
    assert(sharedNode);

    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(sharedNode.x + Math.min(sharedNode.w / 2, 40))),
        y: Math.max(8, Math.round(sharedNode.y + Math.min(sharedNode.h / 2, 20)))
      }
    });
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return Boolean(status?.textContent?.includes("Proposed canvas removal for review."));
    });

    const after = await readCanvas(server.url, { perspectiveId: ids.perspectiveId, cookie: callanCookie });
    assert.equal(after.instances.some(instance => instance.id === sharedInstance), true);

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "canvas.remove" && w.actor === "callan"), false);

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

    const proposalNodeBeforeAttach = canvas.instances.find(instance => instance.thing === proposalThing);
    assert(proposalNodeBeforeAttach);
    await page.locator("#canvas-stage").click({
      position: {
        x: Math.max(8, Math.round(proposalNodeBeforeAttach.x + Math.min(proposalNodeBeforeAttach.w / 2, 40))),
        y: Math.max(8, Math.round(proposalNodeBeforeAttach.y + Math.min(proposalNodeBeforeAttach.h / 2, 20)))
      }
    });
    await page.waitForFunction(expectedAssetId => {
      const select = document.querySelector('[data-attach-asset-select="true"]');
      return Boolean(select && [...select.options].some(option => option.value === expectedAssetId));
    }, assetNode.asset.id);
    await page.selectOption('[data-attach-asset-select="true"]', assetNode.asset.id);
    await page.locator('[data-attach-asset-button]').click();

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
