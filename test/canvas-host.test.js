import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld, projectors } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { moduleProjectors, removeCapability } from "../src/modules.js";
import { applyWitnessToml } from "../src/dsl.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-canvas-host-"));
  return path.join(dir, "todos.json");
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 2000, intervalMs = 15 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k2Z0AAAAASUVORK5CYII=",
  "base64"
);

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

async function startCanvasServer({ extra = "", runtimeRoot = null, runtimeConfig = null, aaronHomeContext = null, callanHomeContext = null } = {}) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "canvas_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
allowActorHeader = true
${runtimeConfig ? `runtimeConfig = { ${runtimeConfig} }` : ""}

[[widget]]
actor = "adam"
id = "todo_app_widget"
kind = "Page"
props = { title = "Witness Todo" }

[[identity]]
actor = "aaron"
id = "identity.aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
${aaronHomeContext ? `homeContext = "${aaronHomeContext}"` : ""}
homePerspective = "aaron:personal"

[[identity]]
actor = "callan"
id = "identity.callan"
label = "Callan"
username = "callan"
password = "callan"
${callanHomeContext ? `homeContext = "${callanHomeContext}"` : ""}
homePerspective = "callan:personal"

[[route]]
actor = "adam"
id = "session_read_route"
method = "GET"
path = "/api/session"
serves = "session"
handler = "session.read"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "session_read_route"

[[route]]
actor = "adam"
id = "session_open_route"
method = "POST"
path = "/api/session"
serves = "session"
handler = "session.open"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "session_open_route"

[[route]]
actor = "adam"
id = "session_logout_route"
method = "DELETE"
path = "/api/session"
serves = "session"
handler = "session.logout"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "session_logout_route"

[[route]]
actor = "adam"
id = "canvas_page_route"
method = "GET"
path = "/canvas"
serves = "canvasView"
handler = "page.canvas"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "canvas_page_route"

[[route]]
actor = "adam"
id = "canvas_read_route"
method = "GET"
path = "/api/canvas"
serves = "canvasView"
handler = "canvas.read"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "canvas_read_route"

[[route]]
actor = "adam"
id = "canvas_perspectives_route"
method = "GET"
path = "/api/canvas/perspectives"
serves = "canvasView"
handler = "canvas.perspectives.list"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "canvas_perspectives_route"

[[route]]
actor = "adam"
id = "canvas_process_route"
method = "POST"
path = "/api/canvas/process"
serves = "canvasView"
handler = "canvas.process"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "canvas_process_route"

[[route]]
actor = "adam"
id = "witnesses_route"
method = "GET"
path = "/api/witnesses"
serves = "witnessLog"
handler = "witnesses.list"

[[serve]]
actor = "adam"
serverRunner = "canvas_server"
route = "witnesses_route"
${extra}
`);
  const root = runtimeRoot || path.dirname(await tempStore());
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "canvas_server",
    runtimeRoot: root
  });
  return { world, server, runtimeRoot: root };
}

const asAaron = { "x-witness-actor": "aaron", "content-type": "application/json" };

function postProcess(server, process, params, headers = asAaron) {
  return fetch(`${server.url}/api/canvas/process`, {
    method: "POST",
    headers,
    body: JSON.stringify({ process, params })
  });
}

function uploadAsset(server, {
  perspective,
  bytes = Buffer.from("hello world"),
  fileName = "hello.txt",
  contentType = "text/plain",
  headers = {},
  multipart = false,
  fields = {}
} = {}) {
  if (multipart) {
    const form = new FormData();
    const file = new File([bytes], fileName, { type: contentType });
    form.set("file", file, fileName);
    form.set("perspective", perspective || "");
    for (const [key, value] of Object.entries(fields)) {
      if (value != null) form.set(key, String(value));
    }
    return fetch(`${server.url}/api/assets?perspective=${encodeURIComponent(perspective || "")}`, {
      method: "POST",
      headers,
      body: form
    });
  }
  return fetch(`${server.url}/api/assets?perspective=${encodeURIComponent(perspective || "")}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-witness-file-name": fileName,
      ...headers
    },
    body: bytes
  });
}

function attachAssetToTarget(server, {
  assetId,
  target,
  perspective = null,
  headers = {}
} = {}) {
  return fetch(`${server.url}/api/assets/${encodeURIComponent(assetId)}/attachments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({ target, perspective })
  });
}

function detachAssetFromTarget(server, {
  assetId,
  target,
  headers = {}
} = {}) {
  return fetch(`${server.url}/api/assets/${encodeURIComponent(assetId)}/attachments?target=${encodeURIComponent(target || "")}`, {
    method: "DELETE",
    headers
  });
}

function blobRequest(server, {
  pathname = "/api/fs/blobs/content",
  method = "GET",
  query = {},
  bytes = null,
  headers = {}
} = {}) {
  const url = new URL(`${server.url}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return fetch(url, {
    method,
    headers,
    body: bytes
  });
}

function streamRequest(server, {
  pathname = "/api/fs/streams/content",
  method = "GET",
  query = {},
  body = null,
  headers = {}
} = {}) {
  const url = new URL(`${server.url}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return fetch(url, {
    method,
    headers,
    body
  });
}

test("canvas page renders with inspector sections and parseable scripts", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await fetch(`${server.url}/canvas`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /canvas-surface/);
    assert.match(html, /Thing properties/);
    assert.match(html, /Projection properties/);
    assert.match(html, /session-username/);
    assert.match(html, /session-status/);
    assert.match(html, /mode-pan-btn/);
    assert.match(html, /snap-toggle-btn/);
    assert.match(html, /canvas\.batch/);
    assert.match(html, /canvas\.duplicate/);
    assert.match(html, /marquee/);
    assert.match(html, /keepalive/);
    assert.match(html, /queueMove/);
    assert.match(html, /FLUSH_DELAY_MS/);
    assert.match(html, /timeline-panel/);
    assert.match(html, /history-banner/);
    assert.match(html, /undo-btn/);
    assert.match(html, /canvas-lib/);
    assert.match(html, /EventSource/);
    assert.match(html, /groupResize/);
    assert.match(html, /canvas\.undo/);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.length > 0, "expected generated canvas scripts");
    for (const script of scripts) {
      assert.doesNotThrow(() => new Function(script));
    }
  } finally {
    await server.close();
  }
});

test("canvas routes are themselves witnessed as route things", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const witnesses = world.allWitnesses();
    const routePaths = witnesses.filter(w => w.process === "defineRoute").map(w => w.body.path);
    assert(routePaths.includes("/canvas"));
    assert(routePaths.includes("/api/canvas/process"));
  } finally {
    await server.close();
  }
});

test("asset upload stores bytes, projects metadata, and serves private content", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-explicit-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("alpha file"),
      fileName: "brief.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();
    assert.equal(body.asset.title, "brief.txt");
    assert.equal(body.asset.mimeType, "text/plain");
    assert.equal(body.asset.context, "context:projects");
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === body.asset.id).storageKey, body.asset.storageKey);
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === body.asset.id).downloadUrl, body.asset.downloadUrl);

    const stored = await fs.readFile(path.join(runtimeRoot, "assets", encodeURIComponent(body.asset.id), "blob"), "utf8");
    assert.equal(stored, "alpha file");

    const content = await fetch(`${server.url}${body.asset.contentUrl}`, { headers: { cookie: login.cookie } });
    assert.equal(content.status, 200);
    assert.equal(content.headers.get("content-type"), "text/plain");
    assert.match(content.headers.get("content-disposition") || "", /^inline;/);
    assert.equal(await content.text(), "alpha file");

    const download = await fetch(`${server.url}${body.asset.downloadUrl}`, { headers: { cookie: login.cookie } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition") || "", /^attachment;/);
    assert.equal(await download.text(), "alpha file");

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const forbidden = await fetch(`${server.url}${body.asset.contentUrl}`, { headers: { cookie: callan.cookie } });
    assert.equal(forbidden.status, 403);
  } finally {
    await server.close();
  }
});

test("asset ingestion derives image thumbnail metadata and serves private thumbnails", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-thumb-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    runtimeConfig: `"jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: ONE_BY_ONE_PNG,
      fileName: "pixel.png",
      contentType: "image/png",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[body.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.thumbnailStatus, "ready");
    assert.equal(asset.imageWidth, 1);
    assert.equal(asset.imageHeight, 1);
    assert.equal(asset.thumbnailRef, `${body.asset.id}/derived/thumbnail.svg`);
    assert.equal(asset.thumbnailUrl, `/api/assets/${encodeURIComponent(body.asset.id)}/thumbnail`);

    const storedThumbnail = await fs.readFile(path.join(runtimeRoot, "assets", encodeURIComponent(body.asset.id), "derived", "thumbnail.svg"), "utf8");
    assert.match(storedThumbnail, /data:image\/png;base64,/);

    const thumbnail = await fetch(`${server.url}${asset.thumbnailUrl}`, { headers: { cookie: login.cookie } });
    assert.equal(thumbnail.status, 200);
    assert.match(thumbnail.headers.get("content-type") || "", /^image\/svg\+xml/);
    assert.match(await thumbnail.text(), /data:image\/png;base64,/);

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const forbidden = await fetch(`${server.url}${asset.thumbnailUrl}`, { headers: { cookie: callan.cookie } });
    assert.equal(forbidden.status, 403);
  } finally {
    await server.close();
  }
});

test("asset ingestion serves derived text for extracted assets with private access control", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-text-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    runtimeConfig: `"jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 39 >>\nstream\nBT\n/F1 12 Tf\n72 72 Td\n(Phase Six Preview) Tj\nET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1"),
      fileName: "brief.pdf",
      contentType: "application/pdf",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[body.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textStatus, "extracted");
    assert.equal(asset.textExtractor, "pdf");
    assert.equal(asset.textRef, `${body.asset.id}/derived/text.txt`);
    assert.equal(asset.textUrl, `/api/assets/${encodeURIComponent(body.asset.id)}/text`);
    assert.equal(asset.derivedMetadata.kind, "pdf");
    assert.equal(asset.derivedMetadata.pageCount, 1);
    assert.equal(asset.derivedMetadata.lineCount, 1);
    assert.equal(asset.derivedMetadata.wordCount, 3);

    const textResponse = await fetch(`${server.url}${asset.textUrl}`, { headers: { cookie: login.cookie } });
    assert.equal(textResponse.status, 200);
    assert.match(textResponse.headers.get("content-type") || "", /^text\/plain/);
    assert.match(await textResponse.text(), /Phase Six Preview/);

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const forbidden = await fetch(`${server.url}${asset.textUrl}`, { headers: { cookie: callan.cookie } });
    assert.equal(forbidden.status, 403);
  } finally {
    await server.close();
  }
});

test("asset ingestion derives structured metadata for csv uploads", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-csv-meta-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    runtimeConfig: `"jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("name,role\nAda,Engineer\nLin,Designer\n", "utf8"),
      fileName: "team.csv",
      contentType: "text/csv",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[body.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "csv");
    assert.deepEqual(asset.derivedMetadata, {
      kind: "csv",
      rowCount: 3,
      dataRowCount: 2,
      columnCount: 2,
      headers: ["name", "role"]
    });
  } finally {
    await server.close();
  }
});

test("asset ingestion derives structured metadata for markdown uploads", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-md-meta-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    runtimeConfig: `"jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("---\nauthor: Aaron\ntags: world\n---\n# Phase Six\n\n## Details\n\nBackend seam notes.\n", "utf8"),
      fileName: "notes.md",
      contentType: "text/markdown",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[body.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "markdown");
    assert.equal(asset.derivedMetadata.kind, "markdown");
    assert.equal(asset.derivedMetadata.title, "Phase Six");
    assert.equal(asset.derivedMetadata.headingCount, 2);
    assert.deepEqual(asset.derivedMetadata.headings, ["Phase Six", "Details"]);
    assert.equal(asset.derivedMetadata.frontmatterKeyCount, 2);
    assert.deepEqual(asset.derivedMetadata.frontmatterKeys, ["author", "tags"]);
  } finally {
    await server.close();
  }
});

test("asset attachments can be created, inspected, projected, and removed over HTTP", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-attach-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const createdThing = await postProcess(server, "canvas.createThing", {
      perspective: "projects:view",
      name: "Proposal",
      x: 120,
      y: 140
    }, { cookie: login.cookie, "content-type": "application/json" });
    assert.equal(createdThing.status, 200);
    const proposalThing = (await createdThing.json()).witness.body.thing;

    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("attach me"),
      fileName: "attach.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const attached = await attachAssetToTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      perspective: "projects:view",
      headers: { cookie: login.cookie }
    });
    assert.equal(attached.status, 201);

    const listed = await fetch(`${server.url}/api/assets/${encodeURIComponent(uploadedBody.asset.id)}/attachments`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.attachments.length, 1);
    assert.equal(listedBody.attachments[0].id, proposalThing);
    assert.equal(listedBody.attachments[0].kind, null);

    const assetRow = world.project(moduleProjectors.assets).find(row => row.id === uploadedBody.asset.id);
    assert.deepEqual(assetRow.attachedTo, [proposalThing]);
    assert.equal(assetRow.attachmentCount, 1);

    const canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("projects:view")}`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    const proposalNode = canvas.canvas.instances.find(row => row.thing === proposalThing);
    assert.equal(proposalNode.attachedAssets.length, 1);
    assert.equal(proposalNode.attachedAssets[0].id, uploadedBody.asset.id);

    const duplicate = await attachAssetToTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      perspective: "projects:view",
      headers: { cookie: login.cookie }
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, "asset already attached to target");

    const detached = await detachAssetFromTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      headers: { cookie: login.cookie }
    });
    assert.equal(detached.status, 200);

    const afterDetach = world.project(moduleProjectors.assets).find(row => row.id === uploadedBody.asset.id);
    assert.deepEqual(afterDetach.attachedTo, []);
    assert.equal(afterDetach.attachmentCount, 0);
  } finally {
    await server.close();
  }
});

test("asset attachment routes return proposals for signed-in unauthorized actors", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-attach-proposal-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:shared"
label = "Shared"

[[perspective]]
actor = "aaron"
id = "shared:view"
title = "Shared View"
context = "context:shared"
`
  });
  try {
    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const createdThing = await postProcess(server, "canvas.createThing", {
      perspective: "shared:view",
      name: "Shared Proposal Thing",
      x: 120,
      y: 140
    }, { cookie: aaron.cookie, "content-type": "application/json" });
    assert.equal(createdThing.status, 200);
    const proposalThing = (await createdThing.json()).witness.body.thing;

    const uploaded = await uploadAsset(server, {
      perspective: "shared:view",
      bytes: Buffer.from("attach me"),
      fileName: "shared-attach.txt",
      headers: { cookie: aaron.cookie }
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const proposedAttach = await attachAssetToTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      perspective: "shared:view",
      headers: { cookie: callan.cookie }
    });
    assert.equal(proposedAttach.status, 202);
    const proposedAttachBody = await proposedAttach.json();
    assert.equal(proposedAttachBody.status, "proposed");
    assert.equal(proposedAttachBody.proposal.targetProcess, "asset.attach");
    assert.equal(proposedAttachBody.proposal.targetId, uploadedBody.asset.id);
    assert.equal(proposedAttachBody.statusMessage, "Proposed asset attachment for review.");
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === uploadedBody.asset.id)?.attachmentCount, 0);
    assert.equal(world.allWitnesses().some(w => w.process === "asset.attach" && w.actor === "callan"), false);

    const allowedAttach = await attachAssetToTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      perspective: "shared:view",
      headers: { cookie: aaron.cookie }
    });
    assert.equal(allowedAttach.status, 201);
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === uploadedBody.asset.id)?.attachmentCount, 1);

    const proposedDetach = await detachAssetFromTarget(server, {
      assetId: uploadedBody.asset.id,
      target: proposalThing,
      headers: { cookie: callan.cookie }
    });
    assert.equal(proposedDetach.status, 202);
    const proposedDetachBody = await proposedDetach.json();
    assert.equal(proposedDetachBody.status, "proposed");
    assert.equal(proposedDetachBody.proposal.targetProcess, "asset.detach");
    assert.equal(proposedDetachBody.proposal.targetId, uploadedBody.asset.id);
    assert.equal(proposedDetachBody.statusMessage, "Proposed asset detachment for review.");
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === uploadedBody.asset.id)?.attachmentCount, 1);
    assert.equal(world.allWitnesses().some(w => w.process === "asset.detach" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("asset upload accepts multipart form-data and witnesses multipart stream metrics", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-multipart-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("multipart body"),
      fileName: "multipart.txt",
      contentType: "text/plain",
      multipart: true,
      fields: { dropContext: "context:projects" },
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();
    assert.equal(body.asset.title, "multipart.txt");
    assert.equal(body.asset.mimeType, "text/plain");

    const assetWitness = world.allWitnesses().find(witness => witness.process === "asset.upload" && witness.body?.id === body.asset.id);
    assert(assetWitness);
    assert.equal(assetWitness.body.uploadKind, "multipart");
    assert.equal(assetWitness.body.declaredSizeBytes, Buffer.byteLength("multipart body"));
    assert.equal(assetWitness.body.chunkCount >= 1, true);
    assert.equal(assetWitness.body.maxChunkBytes >= Buffer.byteLength("multipart body"), true);
    assert.equal(Number.isFinite(assetWitness.body.writeHighWaterMarkBytes), true);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(diagnostics.assets.multipartUploadCount, 1);
    assert.equal(diagnostics.assets.rawUploadCount, 0);
    assert.equal(diagnostics.assets.totalBytes, Buffer.byteLength("multipart body"));
    assert.equal(diagnostics.streams.maxChunkBytes >= Buffer.byteLength("multipart body"), true);
  } finally {
    await server.close();
  }
});

test("asset upload rejects missing filename and empty bodies with witnessed failures", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const missingName = await fetch(`${server.url}/api/assets?perspective=${encodeURIComponent("projects:view")}`, {
      method: "POST",
      headers: {
        cookie: login.cookie,
        "content-type": "text/plain"
      },
      body: Buffer.from("unnamed")
    });
    assert.equal(missingName.status, 400);
    assert.equal((await missingName.json()).error, "missing x-witness-file-name header");

    const empty = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.alloc(0),
      fileName: "empty.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, "empty upload body");

    assert(world.allWitnesses().some(w => w.process === "asset.upload.failed" && w.body.reason === "missing filename header"));
    assert(world.allWitnesses().some(w => w.process === "asset.upload.failed" && w.body.reason === "empty upload body"));
  } finally {
    await server.close();
  }
});

test("asset upload rejects mismatched explicit drop context and missing backend capabilities", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[context]]
actor = "aaron"
id = "context:other"
label = "Other"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const mismatched = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("bad context"),
      fileName: "wrong.txt",
      headers: {
        cookie: login.cookie,
        "x-witness-drop-context": "context:other"
      }
    });
    assert.equal(mismatched.status, 409);
    assert.equal((await mismatched.json()).error, "drop context does not match perspective context");

    removeCapability(world, {
      actor: "adam",
      capability: "upload.asset",
      target: "backendHost",
      targetKind: "host"
    });
    const missingCapability = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("after remove"),
      fileName: "missing.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(missingCapability.status, 503);
    const body = await missingCapability.json();
    assert.equal(body.error, "missing backend capabilities");
    assert.deepEqual(body.missing, ["upload.asset"]);

    assert(world.allWitnesses().some(w => w.process === "asset.upload.failed" && w.body.reason === "drop context does not match perspective context"));
    assert(world.allWitnesses().some(w => w.process === "asset.upload.failed" && w.body.reason === "missing backend capabilities"));
  } finally {
    await server.close();
  }
});

test("fs.blob supports scoped write, folder metadata, listing, read, and recursive delete with stable refs", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-fs-blob-context-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const headers = { cookie: login.cookie, "content-type": "text/plain" };

    const write = await blobRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "docs/brief.txt" },
      headers,
      bytes: Buffer.from("brief body")
    });
    assert.equal(write.status, 201);
    const writeBody = await write.json();
    assert.equal(writeBody.item.path, "docs/brief.txt");
    assert.equal(writeBody.item.mimeType, "text/plain");
    assert.equal(writeBody.item.blobRef, "blob:context:context%3Aprojects:docs/brief.txt");
    assert.equal(writeBody.item.storageKey, "contexts/context%3Aprojects/docs/brief.txt");

    const stored = await fs.readFile(path.join(runtimeRoot, "blobs", "contexts", encodeURIComponent("context:projects"), "docs", "brief.txt", "blob"), "utf8");
    assert.equal(stored, "brief body");

    const folderMeta = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { context: "context:projects", path: "docs" },
      headers: { cookie: login.cookie }
    });
    assert.equal(folderMeta.status, 200);
    assert.equal((await folderMeta.json()).item.kind, "folder");

    const fileMeta = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { context: "context:projects", path: "docs/brief.txt" },
      headers: { cookie: login.cookie }
    });
    assert.equal(fileMeta.status, 200);
    const fileMetaBody = await fileMeta.json();
    assert.equal(fileMetaBody.item.contentUrl, "/api/fs/blobs/content?context=context%3Aprojects&path=docs%2Fbrief.txt");

    const list = await blobRequest(server, {
      pathname: "/api/fs/blobs",
      query: { context: "context:projects", path: "docs" },
      headers: { cookie: login.cookie }
    });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].name, "brief.txt");

    const read = await blobRequest(server, {
      query: { context: "context:projects", path: "docs/brief.txt" },
      headers: { cookie: login.cookie }
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("content-type"), "text/plain");
    assert.equal(await read.text(), "brief body");

    const deleted = await blobRequest(server, {
      pathname: "/api/fs/blobs",
      method: "DELETE",
      query: { context: "context:projects", path: "docs", recursive: "true" },
      headers: { cookie: login.cookie }
    });
    assert.equal(deleted.status, 200);
    const afterDelete = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { context: "context:projects", path: "docs/brief.txt" },
      headers: { cookie: login.cookie }
    });
    assert.equal(afterDelete.status, 404);
  } finally {
    await server.close();
  }
});

test("fs.blob rejects path traversal and enforces context authority", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"
`
  });
  try {
    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const traversal = await blobRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "../secret.txt" },
      headers: { cookie: aaron.cookie, "content-type": "text/plain" },
      bytes: Buffer.from("nope")
    });
    assert.equal(traversal.status, 400);
    assert.equal((await traversal.json()).error, "blob path traversal is not allowed");

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const forbidden = await blobRequest(server, {
      pathname: "/api/fs/blobs",
      query: { context: "context:projects" },
      headers: { cookie: callan.cookie }
    });
    assert.equal(forbidden.status, 403);
    assert(world.allObservations().some(w => w.process === "fs.blob.list.failed" && w.body.reason === "actor lacks authority for context"));
  } finally {
    await server.close();
  }
});

test("fs.blob supports serverRunner-scoped storage for the owning actor", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-fs-blob-runner-"));
  const { server } = await startCanvasServer({ runtimeRoot });
  try {
    const write = await blobRequest(server, {
      method: "PUT",
      query: { serverRunner: "canvas_server", path: "ops/log.txt" },
      headers: { "x-witness-actor": "adam", "content-type": "text/plain" },
      bytes: Buffer.from("runner log")
    });
    assert.equal(write.status, 201);
    const body = await write.json();
    assert.equal(body.item.blobRef, "blob:serverRunner:canvas_server:ops/log.txt");

    const meta = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { serverRunner: "canvas_server", path: "ops/log.txt" },
      headers: { "x-witness-actor": "adam" }
    });
    assert.equal(meta.status, 200);
    assert.equal((await meta.json()).item.scopeKind, "serverRunner");

    const read = await blobRequest(server, {
      query: { serverRunner: "canvas_server", path: "ops/log.txt" },
      headers: { "x-witness-actor": "adam" }
    });
    assert.equal(read.status, 200);
    assert.equal(await read.text(), "runner log");
  } finally {
    await server.close();
  }
});

test("fs.stream supports large streamed write, read, and copy without changing blob scope semantics", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-fs-stream-context-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const payload = Buffer.alloc(1024 * 1024 + 321, 65);

    const write = await streamRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "streams/big.bin" },
      headers: { cookie: login.cookie, "content-type": "application/octet-stream" },
      body: payload
    });
    assert.equal(write.status, 201);
    const writeBody = await write.json();
    assert.equal(writeBody.item.sizeBytes, payload.length);
    const writeWitness = world.allWitnesses().find(witness => witness.process === "fs.stream.write" && witness.body?.path === "streams/big.bin");
    assert(writeWitness);
    assert.equal(writeWitness.body.sizeBytes, payload.length);
    assert.equal(writeWitness.body.chunkCount >= 1, true);
    assert.equal(writeWitness.body.maxChunkBytes >= 1, true);
    assert.equal(Number.isFinite(writeWitness.body.writeHighWaterMarkBytes), true);

    const read = await streamRequest(server, {
      query: { context: "context:projects", path: "streams/big.bin" },
      headers: { cookie: login.cookie }
    });
    assert.equal(read.status, 200);
    const roundTrip = Buffer.from(await read.arrayBuffer());
    assert.equal(roundTrip.length, payload.length);
    assert.equal(roundTrip.compare(payload), 0);

    const copy = await streamRequest(server, {
      pathname: "/api/fs/streams/copy",
      method: "POST",
      query: { context: "context:projects" },
      headers: { cookie: login.cookie, "content-type": "application/json" },
      body: JSON.stringify({ fromPath: "streams/big.bin", toPath: "streams/big-copy.bin" })
    });
    assert.equal(copy.status, 201);
    const copiedMeta = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { context: "context:projects", path: "streams/big-copy.bin" },
      headers: { cookie: login.cookie }
    });
    assert.equal(copiedMeta.status, 200);
    assert.equal((await copiedMeta.json()).item.sizeBytes, payload.length);
    const copyWitness = world.allWitnesses().find(witness => witness.process === "fs.stream.copy" && witness.body?.toPath === "streams/big-copy.bin");
    assert(copyWitness);
    assert.equal(copyWitness.body.sizeBytes, payload.length);
    assert.equal(copyWitness.body.chunkCount >= 1, true);
  } finally {
    await server.close();
  }
});

test("fs.stream failure injection tears down partial writes", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-fs-stream-failure-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await streamRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "streams/fail.bin" },
      headers: {
        cookie: login.cookie,
        "content-type": "application/octet-stream",
        "x-witness-stream-fail-after-bytes": "65536"
      },
      body: Buffer.alloc(200000, 90)
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "stream failure injected");

    const missing = await blobRequest(server, {
      pathname: "/api/fs/blobs/meta",
      query: { context: "context:projects", path: "streams/fail.bin" },
      headers: { cookie: login.cookie }
    });
    assert.equal(missing.status, 404);
    assert(world.allWitnesses().some(w => w.process === "fs.stream.write.failed" && w.body.reason === "stream failure injected"));
  } finally {
    await server.close();
  }
});

test("asset upload rejects public visibility requests when public mode is not enabled", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-private-only-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:public"
label = "Public"

[[perspective]]
actor = "aaron"
id = "public:view"
title = "Public View"
context = "context:public"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "public:view",
      bytes: Buffer.from("public body"),
      fileName: "share.txt",
      headers: {
        cookie: login.cookie,
        "x-witness-visibility": "public"
      }
    });
    assert.equal(uploaded.status, 400);
    assert.equal((await uploaded.json()).error, "public asset hosting is not enabled for this runner");
    assert(world.allWitnesses().some(w => w.process === "asset.upload.failed" && w.body.reason === "public asset hosting is not enabled for this runner"));
  } finally {
    await server.close();
  }
});

test("asset upload can create public assets and public content reads do not require a session when enabled", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-public-enabled-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    runtimeConfig: `"upload.asset.publicEnabled" = true`,
    extra: `
[[context]]
actor = "aaron"
id = "context:public"
label = "Public"

[[perspective]]
actor = "aaron"
id = "public:view"
title = "Public View"
context = "context:public"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "public:view",
      bytes: Buffer.from("public body"),
      fileName: "share.txt",
      headers: {
        cookie: login.cookie,
        "x-witness-visibility": "public"
      }
    });
    assert.equal(uploaded.status, 201);
    const body = await uploaded.json();
    assert.equal(body.asset.visibility, "public");
    assert.equal(world.project(moduleProjectors.assets).find(row => row.id === body.asset.id)?.visibility, "public");

    const anonymous = await fetch(`${server.url}${body.asset.contentUrl}`);
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.headers.get("cache-control"), "public, max-age=60");
    assert.equal(await anonymous.text(), "public body");

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const otherActor = await fetch(`${server.url}${body.asset.contentUrl}`, { headers: { cookie: callan.cookie } });
    assert.equal(otherActor.status, 200);
    assert.equal(await otherActor.text(), "public body");
  } finally {
    await server.close();
  }
});

test("contextless uploads create and reuse the actor files context under homeContext", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-fallback-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    aaronHomeContext: "context:aaron-home",
    extra: `
[[context]]
actor = "aaron"
id = "context:aaron-home"
label = "Aaron Home"

[[perspective]]
actor = "aaron"
id = "aaron:dropbox"
title = "Dropbox"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const first = await uploadAsset(server, {
      perspective: "aaron:dropbox",
      bytes: Buffer.from("one"),
      fileName: "one.txt",
      headers: { cookie: login.cookie }
    });
    const second = await uploadAsset(server, {
      perspective: "aaron:dropbox",
      bytes: Buffer.from("two"),
      fileName: "two.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = await first.json();
    const secondBody = await second.json();
    const filesContextId = "context:context:aaron-home:files";
    assert.equal(firstBody.asset.context, filesContextId);
    assert.equal(secondBody.asset.context, filesContextId);

    const contexts = world.project(moduleProjectors.contexts).filter(row => row.id === filesContextId);
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].label, "Files");
    assert.equal(contexts[0].parent, "context:aaron-home");
  } finally {
    await server.close();
  }
});

test("contextless uploads fail clearly when the actor has no homeContext", async () => {
  const { server } = await startCanvasServer({
    extra: `
[[perspective]]
actor = "aaron"
id = "aaron:dropbox"
title = "Dropbox"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await uploadAsset(server, {
      perspective: "aaron:dropbox",
      bytes: Buffer.from("no home"),
      fileName: "orphan.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "actor has no homeContext for file drops");
  } finally {
    await server.close();
  }
});

test("backend seam diagnostics report asset storage, capability status, and recent failures", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-assets-diagnostics-"));
  const { world, server } = await startCanvasServer({
    runtimeRoot,
    extra: `
[[context]]
actor = "aaron"
id = "context:projects"
label = "Projects"

[[perspective]]
actor = "aaron"
id = "projects:view"
title = "Projects View"
context = "context:projects"
`
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const uploaded = await uploadAsset(server, {
      perspective: "projects:view",
      bytes: Buffer.from("diag body"),
      fileName: "diag.txt",
      headers: { cookie: login.cookie }
    });
    assert.equal(uploaded.status, 201);

    const missingFilename = await fetch(`${server.url}/api/assets?perspective=${encodeURIComponent("projects:view")}`, {
      method: "POST",
      headers: {
        cookie: login.cookie,
        "content-type": "text/plain"
      },
      body: Buffer.from("no filename")
    });
    assert.equal(missingFilename.status, 400);

    const unknownContent = await fetch(`${server.url}/api/assets/ghost/content`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(unknownContent.status, 404);

    const blobFailure = await blobRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "../bad.txt" },
      headers: { cookie: login.cookie, "content-type": "text/plain" },
      bytes: Buffer.from("bad")
    });
    assert.equal(blobFailure.status, 400);

    const streamFailure = await streamRequest(server, {
      method: "PUT",
      query: { context: "context:projects", path: "streams/fail.bin" },
      headers: {
        cookie: login.cookie,
        "content-type": "application/octet-stream",
        "x-witness-stream-fail-after-bytes": "16"
      },
      body: Buffer.alloc(128, 7)
    });
    assert.equal(streamFailure.status, 500);

    const diagnosticsResponse = await fetch(`${server.url}/api/backend-seams`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(diagnostics.backendHost, "backendHost");
    assert(diagnostics.capabilities.includes("upload.asset"));
    assert(diagnostics.capabilities.includes("fs.blob"));
    const uploadCapability = diagnostics.backendCapabilities.find(row => row.id === "upload.asset");
    assert.ok(uploadCapability);
    assert.deepEqual(uploadCapability.dependsOn, ["fs.blob", "fs.stream"]);
    assert.equal(uploadCapability.providerAdapters.some(row => row.id === "local-disk" && row.status === "shipped" && row.default === true), true);
    assert.deepEqual(uploadCapability.witnessContract.externalRefs, ["storageKey", "contentUrl", "textRef", "thumbnailRef", "thumbnailUrl"]);
    const outboundCapability = diagnostics.backendCapabilities.find(row => row.id === "http.outbound");
    assert.ok(outboundCapability);
    assert.deepEqual(outboundCapability.witnessContract.externalRefs, ["externalRefId", "correlationId"]);
    assert.equal(diagnostics.storage.assetsRoot, path.join(runtimeRoot, "assets"));
    assert.equal(diagnostics.storage.assetsRootExists, true);
    assert.equal(diagnostics.storage.blobsRoot, path.join(runtimeRoot, "blobs"));
    assert.equal(diagnostics.assets.total, 1);
    assert.equal(diagnostics.assets.privateCount, 1);
    assert.equal(diagnostics.assets.totalBytes, Buffer.byteLength("diag body"));
    assert.equal(diagnostics.assets.rawUploadCount, 1);
    assert.equal(diagnostics.assets.multipartUploadCount, 0);
    assert.deepEqual(diagnostics.assets.contexts, ["context:projects"]);
    assert.equal(diagnostics.filesContexts.length, 0);
    assert.equal(diagnostics.streams.writeCount, 0);
    assert.equal(diagnostics.streams.copyCount, 0);
    assert.equal(diagnostics.streams.maxChunkBytes >= Buffer.byteLength("diag body"), true);
    assert.equal(diagnostics.notifications.providerMessageCount, 0);
    assert.equal(diagnostics.outbound.externalRefCount, 0);
    assert.equal(diagnostics.oauth.providerAccountCount, 0);
    assert.equal(diagnostics.webhooks.deliveryRefCount, 0);
    assert(diagnostics.failures.assetUploadFailed.some(row => row.body.reason === "missing filename header"));
    assert(diagnostics.failures.assetContentReadFailed.some(row => row.body.reason === "unknown asset"));
    assert(diagnostics.failures.fsBlobFailed.some(row => row.body.reason === "blob path traversal is not allowed"));
    assert(diagnostics.failures.fsStreamFailed.some(row => row.body.reason === "stream failure injected"));
    assert(world.allObservations().some(w => w.process === "backend.readBackendSeams"));
  } finally {
    await server.close();
  }
});

test("backend seam inspection page renders diagnostics HTML for signed-in operators", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await fetch(`${server.url}/backend-seams`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /<h1>Backend Seams<\/h1>/);
    assert.match(html, /\/api\/backend-seams/);
    assert.match(html, /backend-seams-json/);
    assert(world.allObservations().some(w => w.process === "frontend.renderBackendSeamsPage"));
  } finally {
    await server.close();
  }
});

test("end-to-end: perspective, things, placement, move, and relation over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const asAaron = { cookie: login.cookie, "content-type": "application/json" };
    const created = await postProcess(server, "canvas.perspective.create", { title: "Aaron Workspace" }, asAaron);
    assert.equal(created.status, 200);
    const perspective = (await created.json()).witness.body.id;

    const perspectives = await fetch(`${server.url}/api/canvas/perspectives`, { headers: { cookie: login.cookie } }).then(r => r.json());
    assert(perspectives.perspectives.some(p => p.id === perspective && p.title === "Aaron Workspace"));

    const first = await postProcess(server, "canvas.createThing", { perspective, name: "Customer", x: 100, y: 100 }, asAaron).then(r => r.json());
    const second = await postProcess(server, "canvas.createThing", { perspective, name: "Proposal", x: 400, y: 220 }, asAaron).then(r => r.json());

    const moved = await postProcess(server, "canvas.move", { perspective, instance: first.witness.body.instance, x: 150, y: 175 }, asAaron);
    assert.equal(moved.status, 200);

    const related = await postProcess(server, "canvas.relate", { from: first.witness.body.thing, rel: "references", to: second.witness.body.thing, perspective }, asAaron);
    assert.equal(related.status, 200);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: { cookie: login.cookie } }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.length, 2);
    const customer = canvas.instances.find(i => i.label === "Customer");
    assert.equal(customer.x, 150);
    assert.equal(customer.y, 175);
    assert.equal(canvas.connectors.length, 1);
    assert.equal(canvas.connectors[0].rel, "references");
  } finally {
    await server.close();
  }
});

test("canvas process returns proposals for signed-in unauthorized scoped perspective creation", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "adam"
id = "ctx.shared"
label = "Shared"
owner = "aaron"
`
  });
  try {
    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const asAaron = { cookie: aaron.cookie, "content-type": "application/json" };
    const asCallan = { cookie: callan.cookie, "content-type": "application/json" };

    const allowed = await postProcess(server, "canvas.perspective.create", {
      title: "Shared Board",
      context: "ctx.shared"
    }, asAaron);
    assert.equal(allowed.status, 200);

    const forbidden = await postProcess(server, "canvas.perspective.create", {
      title: "Callan Board",
      context: "ctx.shared"
    }, asCallan);
    assert.equal(forbidden.status, 202);
    const forbiddenBody = await forbidden.json();
    assert.equal(forbiddenBody.status, "proposed");
    assert.equal(forbiddenBody.proposal.targetProcess, "canvas.perspective.create");
    assert.equal(forbiddenBody.proposal.targetKind, "context");
    assert.equal(forbiddenBody.proposal.targetId, "ctx.shared");
    assert.equal(forbiddenBody.statusMessage, "Proposed canvas perspective for review.");

    const perspectives = world.project(moduleProjectors.perspectives);
    assert.equal(perspectives.some(row => row.title === "Shared Board" && row.context === "ctx.shared"), true);
    assert.equal(perspectives.some(row => row.title === "Callan Board" && row.context === "ctx.shared"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.perspective.create" && w.actor === "callan"), false);
  } finally {
    await server.close();
  }
});

test("canvas createThing on shared perspectives returns proposals for signed-in unauthorized actors and stamps context on direct creates", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "ctx.shared"
label = "Shared"

[[perspective]]
actor = "aaron"
id = "perspective.shared"
title = "Shared Perspective"
context = "ctx.shared"
`
  });
  try {
    const asAaron = { cookie: (await openSession(server.url, { username: "aaron", password: "aaron" })).cookie, "content-type": "application/json" };
    const asCallan = { cookie: (await openSession(server.url, { username: "callan", password: "callan" })).cookie, "content-type": "application/json" };

    const allowed = await postProcess(server, "canvas.createThing", {
      perspective: "perspective.shared",
      name: "Shared Customer",
      x: 100,
      y: 100
    }, asAaron);
    assert.equal(allowed.status, 200);
    const allowedBody = await allowed.json();
    assert.equal(allowedBody.witness.body.context, "ctx.shared");
    assert.equal(world.project(projectors.currentRelations).some(r => r.from === allowedBody.witness.body.thing && r.rel === "inContext" && r.to === "ctx.shared"), true);

    const proposed = await postProcess(server, "canvas.createThing", {
      perspective: "perspective.shared",
      name: "Hijacked Customer",
      x: 220,
      y: 180
    }, asCallan);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.status, "proposed");
    assert.equal(proposedBody.proposal.targetProcess, "canvas.createThing");
    assert.equal(proposedBody.proposal.targetKind, "context");
    assert.equal(proposedBody.proposal.targetId, "ctx.shared");
    assert.equal(proposedBody.statusMessage, "Proposed canvas thing for review.");
    const canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("perspective.shared")}`, {
      headers: { cookie: asAaron.cookie }
    }).then(response => response.json());
    assert.equal(canvas.canvas.instances.some(instance => instance.label === "Hijacked Customer"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.createThing" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("canvas thing mutation processes return proposals for signed-in unauthorized actors", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const asAaron = { cookie: aaron.cookie, "content-type": "application/json" };
    const asCallan = { cookie: callan.cookie, "content-type": "application/json" };

    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Authority Board" }, asAaron).then(r => r.json())).witness.body.id;
    const first = (await postProcess(server, "canvas.createThing", { perspective, name: "Customer", x: 100, y: 100 }, asAaron).then(r => r.json())).witness.body;
    const second = (await postProcess(server, "canvas.createThing", { perspective, name: "Proposal", x: 400, y: 220 }, asAaron).then(r => r.json())).witness.body;

    const rename = await postProcess(server, "canvas.thing.setTitle", {
      thing: first.thing,
      title: "Hijacked Customer",
      perspective
    }, asCallan);
    assert.equal(rename.status, 202);
    const renameBody = await rename.json();
    assert.equal(renameBody.status, "proposed");
    assert.equal(renameBody.proposal.targetProcess, "canvas.thing.setTitle");
    assert.equal(renameBody.proposal.targetId, first.thing);

    const relate = await postProcess(server, "canvas.relate", {
      from: first.thing,
      rel: "references",
      to: second.thing,
      perspective
    }, asCallan);
    assert.equal(relate.status, 202);
    const relateBody = await relate.json();
    assert.equal(relateBody.status, "proposed");
    assert.equal(relateBody.proposal.targetProcess, "canvas.relate");
    assert.equal(relateBody.proposal.targetId, first.thing);

    const allowedRelate = await postProcess(server, "canvas.relate", {
      from: first.thing,
      rel: "references",
      to: second.thing,
      perspective
    }, asAaron);
    assert.equal(allowedRelate.status, 200);

    const unrelate = await postProcess(server, "canvas.unrelate", {
      from: first.thing,
      rel: "references",
      to: second.thing,
      perspective
    }, asCallan);
    assert.equal(unrelate.status, 202);
    const unrelateBody = await unrelate.json();
    assert.equal(unrelateBody.status, "proposed");
    assert.equal(unrelateBody.proposal.targetProcess, "canvas.unrelate");
    assert.equal(unrelateBody.proposal.targetId, first.thing);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.some(instance => instance.label === "Hijacked Customer"), false);
    assert.equal(canvas.connectors.length, 1);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.thing.setTitle" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.relate" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.unrelate" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("placing the same thing twice over HTTP yields two instances", async () => {
  const { server } = await startCanvasServer();
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const asAaron = { cookie: login.cookie, "content-type": "application/json" };
    const created = await postProcess(server, "canvas.perspective.create", { title: "Dupes" }, asAaron).then(r => r.json());
    const perspective = created.witness.body.id;
    const thing = (await postProcess(server, "canvas.createThing", { perspective, name: "Customer", x: 0, y: 0 }, asAaron).then(r => r.json())).witness.body.thing;
    const again = await postProcess(server, "canvas.place", { perspective, thing, x: 300, y: 300 }, asAaron);
    assert.equal(again.status, 200);
    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: { cookie: login.cookie } }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.length, 2);
    assert.equal(canvas.availableThings.find(t => t.id === thing).placed, 2);
  } finally {
    await server.close();
  }
});

test("moveMany over HTTP is atomic: happy path moves both, bad instance moves neither", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Batch" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const ok = await postProcess(server, "canvas.moveMany", { perspective, moves: [{ instance: a, x: 100, y: 100 }, { instance: b, x: 200, y: 200 }] });
    assert.equal(ok.status, 200);

    const bad = await postProcess(server, "canvas.moveMany", { perspective, moves: [{ instance: a, x: 900, y: 900 }, { instance: "ghost", x: 1, y: 1 }] });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).witness.process, "canvas.moveMany.failed");

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 100);
    assert.equal(canvas.instances.find(i => i.id === b).y, 200);
  } finally {
    await server.close();
  }
});

test("removeMany and duplicate work end-to-end over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Ops" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const clone = await postProcess(server, "canvas.duplicate", { perspective, instance: a, x: 240, y: 260 }).then(r => r.json());
    assert.equal(clone.witness.body.x, 240);

    const removed = await postProcess(server, "canvas.removeMany", { perspective, instances: [a, b] });
    assert.equal(removed.status, 200);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.deepEqual(canvas.instances.map(i => i.id), [clone.witness.body.instance]);
  } finally {
    await server.close();
  }
});

test("canvas.batch applies moves, style, camera, and grid in exactly one witness over HTTP", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Outbox" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const countBefore = world.allWitnesses().length;
    const response = await postProcess(server, "canvas.batch", {
      perspective,
      moves: [{ instance: a, x: 100, y: 110 }, { instance: b, x: 200, y: 210 }],
      styles: [{ instance: a, style: { color: "#ffcc00" } }],
      camera: { x: 5, y: 6, zoom: 2 },
      grid: { snap: true, size: 20 }
    });
    assert.equal(response.status, 200);
    assert.equal(world.allWitnesses().length, countBefore + 1);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 100);
    assert.equal(canvas.instances.find(i => i.id === b).y, 210);
    assert.equal(canvas.instances.find(i => i.id === a).style.color, "#ffcc00");
    assert.deepEqual(canvas.perspective.camera, { x: 5, y: 6, zoom: 2 });
    assert.deepEqual(canvas.perspective.grid, { snap: true, size: 20 });
  } finally {
    await server.close();
  }
});

test("canvas.batch on shared perspectives returns proposals for signed-in unauthorized actors", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "ctx.shared"
label = "Shared"

[[perspective]]
actor = "aaron"
id = "perspective.shared.batch"
title = "Shared Batch Perspective"
context = "ctx.shared"
`
  });
  try {
    const asAaron = { cookie: (await openSession(server.url, { username: "aaron", password: "aaron" })).cookie, "content-type": "application/json" };
    const asCallan = { cookie: (await openSession(server.url, { username: "callan", password: "callan" })).cookie, "content-type": "application/json" };
    const created = await postProcess(server, "canvas.createThing", {
      perspective: "perspective.shared.batch",
      name: "Shared Batch Node",
      x: 0,
      y: 0
    }, asAaron);
    assert.equal(created.status, 200);
    const createdBody = await created.json();

    const proposed = await postProcess(server, "canvas.batch", {
      perspective: "perspective.shared.batch",
      moves: [{ instance: createdBody.witness.body.instance, x: 100, y: 120 }]
    }, asCallan);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.status, "proposed");
    assert.equal(proposedBody.proposal.targetProcess, "canvas.batch");
    assert.equal(proposedBody.proposal.targetKind, "context");
    assert.equal(proposedBody.proposal.targetId, "ctx.shared");
    assert.equal(proposedBody.statusMessage, "Proposed canvas layout change for review.");

    const canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("perspective.shared.batch")}`, {
      headers: { cookie: asAaron.cookie }
    }).then(response => response.json());
    assert.equal(canvas.canvas.instances.find(instance => instance.id === createdBody.witness.body.instance)?.x, 0);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.batch" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("shared canvas duplicate and removeMany routes return proposals for signed-in unauthorized actors", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "ctx.shared"
label = "Shared"

[[perspective]]
actor = "aaron"
id = "perspective.shared.instances"
title = "Shared Instance Perspective"
context = "ctx.shared"
`
  });
  try {
    const asAaron = { cookie: (await openSession(server.url, { username: "aaron", password: "aaron" })).cookie, "content-type": "application/json" };
    const asCallan = { cookie: (await openSession(server.url, { username: "callan", password: "callan" })).cookie, "content-type": "application/json" };
    const created = await postProcess(server, "canvas.createThing", {
      perspective: "perspective.shared.instances",
      name: "Shared Instance Node",
      x: 0,
      y: 0
    }, asAaron).then(r => r.json());

    const duplicate = await postProcess(server, "canvas.duplicate", {
      perspective: "perspective.shared.instances",
      instance: created.witness.body.instance,
      x: 48,
      y: 64
    }, asCallan);
    assert.equal(duplicate.status, 202);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.status, "proposed");
    assert.equal(duplicateBody.proposal.targetProcess, "canvas.duplicate");
    assert.equal(duplicateBody.proposal.targetKind, "context");
    assert.equal(duplicateBody.proposal.targetId, "ctx.shared");
    assert.equal(duplicateBody.statusMessage, "Proposed canvas duplicate for review.");

    let canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("perspective.shared.instances")}`, {
      headers: { cookie: asAaron.cookie }
    }).then(response => response.json());
    assert.equal(canvas.canvas.instances.length, 1);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.duplicate" && w.actor === "callan"), false);

    const directDuplicate = await postProcess(server, "canvas.duplicate", {
      perspective: "perspective.shared.instances",
      instance: created.witness.body.instance,
      x: 48,
      y: 64
    }, asAaron);
    assert.equal(directDuplicate.status, 200);
    const directDuplicateBody = await directDuplicate.json();

    const removeMany = await postProcess(server, "canvas.removeMany", {
      perspective: "perspective.shared.instances",
      instances: [created.witness.body.instance, directDuplicateBody.witness.body.instance]
    }, asCallan);
    assert.equal(removeMany.status, 202);
    const removeManyBody = await removeMany.json();
    assert.equal(removeManyBody.status, "proposed");
    assert.equal(removeManyBody.proposal.targetProcess, "canvas.removeMany");
    assert.equal(removeManyBody.proposal.targetKind, "context");
    assert.equal(removeManyBody.proposal.targetId, "ctx.shared");
    assert.equal(removeManyBody.statusMessage, "Proposed canvas removals for review.");

    canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("perspective.shared.instances")}`, {
      headers: { cookie: asAaron.cookie }
    }).then(response => response.json());
    assert.equal(canvas.canvas.instances.length, 2);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.removeMany" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().filter(w => w.process === "proposal.create" && w.actor === "callan").length >= 2, true);
  } finally {
    await server.close();
  }
});

test("shared canvas place route returns proposals for signed-in unauthorized actors", async () => {
  const { world, server } = await startCanvasServer({
    extra: `
[[context]]
actor = "aaron"
id = "ctx.shared"
label = "Shared"

[[perspective]]
actor = "aaron"
id = "perspective.shared.place"
title = "Shared Place Perspective"
context = "ctx.shared"
`
  });
  try {
    const asAaron = { cookie: (await openSession(server.url, { username: "aaron", password: "aaron" })).cookie, "content-type": "application/json" };
    const asCallan = { cookie: (await openSession(server.url, { username: "callan", password: "callan" })).cookie, "content-type": "application/json" };
    const created = await postProcess(server, "canvas.createThing", {
      perspective: "perspective.shared.place",
      name: "Shared Place Node",
      x: 0,
      y: 0
    }, asAaron).then(r => r.json());

    const placed = await postProcess(server, "canvas.place", {
      perspective: "perspective.shared.place",
      thing: created.witness.body.thing,
      x: 300,
      y: 320
    }, asCallan);
    assert.equal(placed.status, 202);
    const placedBody = await placed.json();
    assert.equal(placedBody.status, "proposed");
    assert.equal(placedBody.proposal.targetProcess, "canvas.place");
    assert.equal(placedBody.proposal.targetKind, "context");
    assert.equal(placedBody.proposal.targetId, "ctx.shared");
    assert.equal(placedBody.statusMessage, "Proposed canvas placement for review.");

    const canvas = await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent("perspective.shared.place")}`, {
      headers: { cookie: asAaron.cookie }
    }).then(response => response.json());
    assert.equal(canvas.canvas.instances.filter(instance => instance.thing === created.witness.body.thing).length, 1);
    assert.equal(world.allWitnesses().some(w => w.process === "canvas.place" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("canvas.batch with a ghost instance applies nothing", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Atomic" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;

    const response = await postProcess(server, "canvas.batch", {
      perspective,
      moves: [{ instance: a, x: 900, y: 900 }, { instance: "ghost", x: 1, y: 1 }],
      camera: { x: 50, y: 50, zoom: 3 }
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).witness.process, "canvas.batch.failed");

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 0);
    assert.equal(canvas.perspective.camera, null);
  } finally {
    await server.close();
  }
});

test("undo and redo work over HTTP; empty stack is a 400 with the failure witness", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "History" }).then(r => r.json())).witness.body.id;

    const empty = await postProcess(server, "canvas.undo", { perspective });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).witness.process, "canvas.undo.failed");

    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 10, y: 10 }).then(r => r.json())).witness.body.instance;
    const moved = await postProcess(server, "canvas.move", { perspective, instance: a, x: 300, y: 300 });
    assert.equal(moved.status, 200);

    const undone = await postProcess(server, "canvas.undo", { perspective });
    assert.equal(undone.status, 200);
    let canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 10);

    const redone = await postProcess(server, "canvas.redo", { perspective });
    assert.equal(redone.status, 200);
    canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 300);
  } finally {
    await server.close();
  }
});

test("canvas-lib serves the real projection modules and rejects unknown names", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const projection = await fetch(`${server.url}/canvas-lib/canvas-projection.js`);
    assert.equal(projection.status, 200);
    assert.match(projection.headers.get("content-type"), /text\/javascript/);
    assert.match(await projection.text(), /from "\.\/projectors-core\.js"/);

    const core = await fetch(`${server.url}/canvas-lib/projectors-core.js`);
    assert.equal(core.status, 200);
    assert.match(await core.text(), /currentRelations/);

    const edenPersonalBox = await fetch(`${server.url}/canvas-lib/eden-personal-box.js`);
    assert.equal(edenPersonalBox.status, 200);
    assert.match(await edenPersonalBox.text(), /projectEdenPersonalBoxItems/);

    const edenPageTheme = await fetch(`${server.url}/canvas-lib/eden-page-theme.js`);
    assert.equal(edenPageTheme.status, 200);
    assert.match(await edenPageTheme.text(), /projectEdenPageTheme/);

    assert.equal((await fetch(`${server.url}/canvas-lib/kernel.js`)).status, 404);
    assert.equal((await fetch(`${server.url}/canvas-lib/..%2Fpackage.json`)).status, 404);
    assert(world.allObservations().some(w => w.process === "backend.readCanvasLib"));
  } finally {
    await server.close();
  }
});

test("witness offset fetches return the tail and are not themselves witnessed", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const full = await fetch(`${server.url}/api/witnesses`, { headers: asAaron }).then(r => r.json());
    assert(full.total > 0);

    const readsBefore = world.allObservations().filter(w => w.process === "backend.readWitnesses").length;
    const offset = full.total - 2;
    const tail = await fetch(`${server.url}/api/witnesses?offset=${offset}`, { headers: asAaron }).then(r => r.json());
    assert.equal(tail.offset, offset);
    assert(tail.witnesses.length >= 2);
    assert.equal(tail.witnesses.length, tail.total - offset);
    const readsAfter = world.allObservations().filter(w => w.process === "backend.readWitnesses").length;
    assert.equal(readsAfter, readsBefore);
  } finally {
    await server.close();
  }
});

test("SSE stream signals witness growth and the server still closes cleanly", async () => {
  const { server } = await startCanvasServer();
  const controller = new AbortController();
  try {
    const response = await fetch(`${server.url}/api/events`, { headers: asAaron, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let received = "";
    const readFrame = async () => {
      while (!received.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
      const frame = received.slice(0, received.indexOf("\n\n"));
      received = received.slice(received.indexOf("\n\n") + 2);
      return frame;
    };

    const initial = await readFrame();
    assert.match(initial, /data: \{"count":\d+,"id":.+,"process":.+\}/);

    await postProcess(server, "canvas.perspective.create", { title: "Streamed" });
    const update = await readFrame();
    assert.match(update, /data: \{"count":\d+,"id":.+,"process":".+"\}/);

    controller.abort();
  } catch (err) {
    if (err?.name !== "AbortError") throw err;
  } finally {
    await server.close();
  }
});

test("client projection module output matches the server canvas API", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Parity" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 10, y: 10 }).then(r => r.json())).witness.body;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 200, y: 200 }).then(r => r.json())).witness.body;
    await postProcess(server, "canvas.relate", { from: a.thing, rel: "references", to: b.thing, perspective });

    const served = await fetch(`${server.url}/canvas-lib/canvas-projection.js`).then(r => r.text());
    assert(served.length > 0);
    const { canvasProjection } = await import("../plugins/canvas/canvas-projection.js");
    const { publicWitnessesFor } = await import("../plugins/demo/projections.js");
    const local = canvasProjection(publicWitnessesFor(world.allWitnesses(), "aaron"), perspective);

    const api = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.deepEqual(local, api);
  } finally {
    await server.close();
  }
});

test("canvas process without an actor is rejected with a failure witness", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.perspective.create", { title: "Nope" }, { "content-type": "application/json" });
    assert.equal(response.status, 401);
    assert(world.allWitnesses().some(w => w.process === "canvas.process.failed" && w.body.reason === "no actor"));
  } finally {
    await server.close();
  }
});

test("unknown canvas process is rejected with a failure witness", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.hack", {});
    assert.equal(response.status, 400);
    assert((await response.json()).error, "unknown canvas process");
    assert(world.allWitnesses().some(w => w.process === "canvas.process.failed" && w.body.process === "canvas.hack"));
  } finally {
    await server.close();
  }
});

test("rejected canvas processes surface their witness over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.move", { perspective: "nope", instance: "missing", x: 1, y: 2 });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.witness.process, "canvas.move.failed");
  } finally {
    await server.close();
  }
});

test("unknown perspective on GET /api/canvas returns 404", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await fetch(`${server.url}/api/canvas?perspective=ghost`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});
